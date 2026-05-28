/**
 * Auth for data-drills.
 * Supports: API Key (dd_ prefix) and Clerk JWT (email verified against DB).
 */

import * as jose from "jose";
import { db } from "@/lib/db";
import { apiKey, user } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

export interface AuthResult {
  authenticated: true;
  userId: string;
  name: string;
  email: string;
}

// ── API Key verification ──

// In-memory cache keyed on the full token. bcrypt.compare is 20-50 ms of
// CPU which alone approaches the Workers per-request budget, so caching is
// necessary to sustain burst usage (e.g. the taxtant sync tool running
// 70+ sequential requests). Entries live 5 minutes; revocations propagate
// after at most that delay, which is acceptable for a single-user tool.
const apiKeyAuthCache = new Map<string, { result: AuthResult; expiresAt: number }>();
const API_KEY_CACHE_TTL = 5 * 60 * 1000;

async function verifyApiKeyToken(token: string): Promise<AuthResult | null> {
  const cached = apiKeyAuthCache.get(token);
  if (cached && Date.now() < cached.expiresAt) {
    // last-used を非同期で更新 (キャッシュヒット時も)
    void db.update(apiKey).set({ lastUsedAt: new Date() })
      .where(eq(apiKey.keyPrefix, token.slice(0, 11)))
      .catch(() => { /* best-effort */ });
    return cached.result;
  }

  const prefix = token.slice(0, 11); // dd_ + 8 chars
  const rows = await db
    .select()
    .from(apiKey)
    .where(eq(apiKey.keyPrefix, prefix))
    .limit(1);

  if (rows.length === 0) return null;
  const row = rows[0];
  if (!row.isActive) return null;

  const rawKey = token.slice(3); // strip dd_ prefix
  const valid = await bcrypt.compare(rawKey, row.keyHash);
  if (!valid) return null;

  // 認証成功 → last-used を更新 (await しない、認証経路を遅らせない)
  void db.update(apiKey).set({ lastUsedAt: new Date() })
    .where(eq(apiKey.keyPrefix, prefix))
    .catch(() => { /* best-effort */ });

  // API key は user に紐付かないので userId は空のまま。name は key の名前で
  // 「誰が叩いたか」を最低限ログ・debug に出せるようにする。
  const result: AuthResult = {
    authenticated: true,
    userId: "",
    name: `apikey:${row.name}`,
    email: "",
  };
  apiKeyAuthCache.set(token, { result, expiresAt: Date.now() + API_KEY_CACHE_TTL });
  return result;
}

// ── Clerk JWKS ──

function getClerkDomain(): string | null {
  const pk = process.env.VITE_CLERK_PUBLISHABLE_KEY;
  if (!pk) return null;
  const encoded = pk.replace(/^pk_(test|live)_/, "");
  try {
    return atob(encoded).replace(/\$$/, "");
  } catch {
    return null;
  }
}

let clerkJWKS: ReturnType<typeof jose.createRemoteJWKSet> | null = null;

function getClerkJWKS() {
  if (clerkJWKS) return clerkJWKS;
  const domain = getClerkDomain();
  if (!domain) return null;
  clerkJWKS = jose.createRemoteJWKSet(
    new URL(`https://${domain}/.well-known/jwks.json`),
  );
  return clerkJWKS;
}

interface ClerkIdentity {
  userId: string;
  email: string | null;
}

// ── In-memory cache (process-level, cleared on redeploy) ──

const emailCache = new Map<string, { email: string | null; expiresAt: number }>();
const EMAIL_CACHE_TTL = 10 * 60 * 1000;

const authCache = new Map<string, { result: AuthResult; expiresAt: number }>();
const AUTH_CACHE_TTL = 5 * 60 * 1000;

function getCachedEmail(userId: string): string | null | undefined {
  const entry = emailCache.get(userId);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) { emailCache.delete(userId); return undefined; }
  return entry.email;
}

function setCachedEmail(userId: string, email: string | null) {
  emailCache.set(userId, { email, expiresAt: Date.now() + EMAIL_CACHE_TTL });
}

function getCachedAuth(email: string): AuthResult | null {
  const entry = authCache.get(email);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { authCache.delete(email); return null; }
  return entry.result;
}

function setCachedAuth(email: string, result: AuthResult) {
  authCache.set(email, { result, expiresAt: Date.now() + AUTH_CACHE_TTL });
}

async function fetchClerkEmail(userId: string): Promise<string | null> {
  const cached = getCachedEmail(userId);
  if (cached !== undefined) return cached;

  const clerkSecretKey = process.env.CLERK_SECRET_KEY;
  if (!clerkSecretKey) return null;

  try {
    const res = await fetch(`https://api.clerk.com/v1/users/${userId}`, {
      headers: { Authorization: `Bearer ${clerkSecretKey}` },
    });
    if (res.ok) {
      const userData = await res.json() as {
        email_addresses?: Array<{ email_address: string; id: string }>;
        primary_email_address_id?: string;
      };
      const primary = userData.email_addresses?.find(
        (e) => e.id === userData.primary_email_address_id,
      );
      const email = primary?.email_address ?? userData.email_addresses?.[0]?.email_address ?? null;
      setCachedEmail(userId, email);
      return email;
    }
  } catch {
    // Clerk API unreachable — continue without email
  }
  return null;
}

async function verifyClerkToken(token: string): Promise<ClerkIdentity | null> {
  const jwks = getClerkJWKS();
  if (!jwks) return null;
  try {
    const { payload } = await jose.jwtVerify(token, jwks);
    const userId = payload.sub as string;
    if (!userId) return null;

    const email = await fetchClerkEmail(userId);
    return { userId, email };
  } catch {
    return null;
  }
}

/**
 * Look up user by email in the DB.
 * Returns null if user doesn't exist or is inactive.
 */
async function findUser(email: string): Promise<AuthResult | null> {
  const rows = await db
    .select({ id: user.id, name: user.name, email: user.email })
    .from(user)
    .where(eq(user.email, email))
    .limit(1);
  if (rows.length === 0) return null;
  const row = rows[0];
  return { authenticated: true, userId: row.id, name: row.name, email: row.email };
}

// ── Token extraction ──

function extractBearerToken(req: Request): string | null {
  const apiKeyHeader = req.headers.get("x-api-key");
  if (apiKeyHeader) return apiKeyHeader;

  const header = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice(7);
}

function extractSessionCookie(req: Request): string | null {
  const cookieHeader = req.headers.get("cookie");
  if (!cookieHeader) return null;
  const clerk = cookieHeader.match(/(?:^|;\s*)__session=([^;]*)/);
  return clerk ? clerk[1] : null;
}

// ── Main authenticate ──

export async function authenticate(req: Request): Promise<AuthResult | null> {
  const bearerToken = extractBearerToken(req);
  const cookieToken = extractSessionCookie(req);

  for (const token of [bearerToken, cookieToken]) {
    if (!token) continue;

    if (token.startsWith("dd_")) {
      return verifyApiKeyToken(token);
    }

    // Try Clerk JWKS → verify user exists in DB by email
    const clerkIdentity = await verifyClerkToken(token);
    if (clerkIdentity) {
      if (clerkIdentity.email) {
        const cached = getCachedAuth(clerkIdentity.email);
        if (cached) return cached;
        const result = await findUser(clerkIdentity.email);
        if (result) {
          setCachedAuth(clerkIdentity.email, result);
          return result;
        }
      }
      return null;
    }
  }

  return null;
}
