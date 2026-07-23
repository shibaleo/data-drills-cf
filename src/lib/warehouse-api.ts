/**
 * data-warehouse presentation API client (read-only).
 *
 * Replaces the former direct-Neon reads (`@/lib/neon-db`). The warehouse now
 * lives behind a Cloudflare Worker (Hono + D1) that serves the same transform
 * models we used to SELECT from Neon, with byte-compatible envelopes.
 *
 * Auth = the warehouse's OAuth client_credentials grant with private_key_jwt
 * client authentication (RFC 7521/7523). drills is a backend consumer: it signs
 * a short-lived client_assertion JWT with its Ed25519 PRIVATE key
 * (DWH_CLIENT_PRIVATE_JWK) and exchanges it for a 24h access token. The
 * warehouse holds only the matching PUBLIC key — no shared secret, so bws is not
 * in the warehouse's trust chain and works identically after a Vercel move. The
 * interactive Clerk/PKCE path on the warehouse stays for delegated clients (MCP).
 */
import * as jose from "jose";
import { config } from "@/lib/config";
import { env } from "@/lib/env";

const CLIENT_ASSERTION_TYPE = "urn:ietf:params:oauth:client-assertion-type:jwt-bearer";

function apiBase(): string {
  return (env.WAREHOUSE_API_BASE_URL ?? config.warehouseApiBaseUrl).replace(/\/+$/, "");
}

let cachedToken: { token: string; expiresAt: number } | null = null;
let cachedKey: Promise<CryptoKey | Uint8Array> | null = null;

function clientKey(): Promise<CryptoKey | Uint8Array> {
  if (!cachedKey) cachedKey = jose.importJWK(JSON.parse(env.DWH_CLIENT_PRIVATE_JWK), "EdDSA");
  return cachedKey;
}

async function fetchAccessToken(): Promise<string> {
  const base = apiBase();
  const key = await clientKey();
  // RFC 7523 client assertion: iss == sub == client_id, aud == token endpoint.
  const assertion = await new jose.SignJWT({})
    .setProtectedHeader({ alg: "EdDSA" })
    .setIssuer(env.DWH_CLIENT_ID)
    .setSubject(env.DWH_CLIENT_ID)
    .setAudience(`${base}/oauth/token`)
    .setIssuedAt()
    .setJti(crypto.randomUUID())
    .setExpirationTime("2m")
    .sign(key);

  const res = await fetch(`${base}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_assertion_type: CLIENT_ASSERTION_TYPE,
      client_assertion: assertion,
    }),
  });
  if (!res.ok) {
    throw new Error(`warehouse token request failed: ${res.status} ${await res.text()}`);
  }
  const j = (await res.json()) as { access_token: string; expires_in: number };
  // refresh 60s early to avoid edge-of-expiry races.
  cachedToken = { token: j.access_token, expiresAt: Date.now() + (j.expires_in - 60) * 1000 };
  return cachedToken.token;
}

async function getAccessToken(force = false): Promise<string> {
  if (!force && cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.token;
  return fetchAccessToken();
}

/**
 * GET `${base}/api/v1${path}` with the OAuth bearer, returning the parsed JSON
 * envelope. Retries once on 401 with a forced token refresh (handles a stale
 * cached access token after an isolate has been warm past 24h).
 */
export async function whGet<T>(
  path: string,
  query?: Record<string, string | undefined>,
): Promise<T> {
  const url = new URL(`${apiBase()}/api/v1${path}`);
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v != null && v !== "") url.searchParams.set(k, v);
  }
  const call = async (token: string) =>
    fetch(url, { headers: { Authorization: `Bearer ${token}` } });

  let res = await call(await getAccessToken());
  if (res.status === 401) res = await call(await getAccessToken(true));
  if (!res.ok) {
    throw new Error(`warehouse GET ${path} -> ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as T;
}
