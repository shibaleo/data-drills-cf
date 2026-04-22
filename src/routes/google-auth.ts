import { Hono } from "hono";
import { authenticate } from "@/lib/auth";
import { db } from "@/lib/db";
import { oauthToken } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getAuthUrl, exchangeCode, getValidAccessToken } from "@/lib/google-oauth";

const app = new Hono();

/**
 * GET / — Initiate Google OAuth flow (redirect to Google consent screen)
 */
app.get("/", async (c) => {
  const result = await authenticate(c.req.raw);
  if (!result) return c.json({ error: "Unauthorized" }, 401);

  const authUrl = getAuthUrl();
  return c.redirect(authUrl);
});

/**
 * GET /callback — OAuth callback from Google (public — no auth required)
 */
app.get("/callback", async (c) => {
  const code = c.req.query("code");
  if (!code) return c.json({ error: "Missing code" }, 400);

  const baseUrl = process.env.VITE_BASE_URL ?? "http://localhost:3000";

  try {
    const tokens = await exchangeCode(code);
    const expiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000)
      : null;

    // Upsert: update existing google token or insert new one
    const existing = await db
      .select({ id: oauthToken.id })
      .from(oauthToken)
      .where(eq(oauthToken.provider, "google"))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(oauthToken)
        .set({
          accessToken: tokens.access_token ?? "",
          refreshToken: tokens.refresh_token ?? null,
          tokenExpiresAt: expiresAt,
          updatedAt: new Date(),
        })
        .where(eq(oauthToken.id, existing[0].id));
    } else {
      await db.insert(oauthToken).values({
        provider: "google",
        accessToken: tokens.access_token ?? "",
        refreshToken: tokens.refresh_token ?? null,
        tokenExpiresAt: expiresAt,
      });
    }

    return c.redirect(`${baseUrl}/?google=connected`);
  } catch (err) {
    console.error("Google OAuth callback error:", err);
    return c.redirect(`${baseUrl}/?google=error`);
  }
});

/**
 * GET /token — Return a fresh access_token for client-side Google Picker API
 */
app.get("/token", async (c) => {
  const result = await authenticate(c.req.raw);
  if (!result) return c.json({ error: "Unauthorized" }, 401);

  const [tokens] = await db
    .select()
    .from(oauthToken)
    .where(eq(oauthToken.provider, "google"))
    .limit(1);

  if (!tokens) return c.json({ error: "Google Drive not connected" }, 400);

  const accessToken = await getValidAccessToken({
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
    token_expires_at: tokens.tokenExpiresAt,
  });

  // Persist refreshed token if changed
  if (accessToken !== tokens.accessToken) {
    await db
      .update(oauthToken)
      .set({
        accessToken,
        updatedAt: new Date(),
      })
      .where(eq(oauthToken.id, tokens.id));
  }

  return c.json({ accessToken });
});

/**
 * GET /status — Check if Google Drive is connected
 */
app.get("/status", async (c) => {
  const result = await authenticate(c.req.raw);
  if (!result) return c.json({ error: "Unauthorized" }, 401);

  const rows = await db
    .select({ id: oauthToken.id, updatedAt: oauthToken.updatedAt })
    .from(oauthToken)
    .where(eq(oauthToken.provider, "google"))
    .limit(1);

  return c.json({
    connected: rows.length > 0,
    updatedAt: rows[0]?.updatedAt ?? null,
  });
});

/**
 * POST /disconnect — Disconnect Google Drive
 */
app.post("/disconnect", async (c) => {
  const result = await authenticate(c.req.raw);
  if (!result) return c.json({ error: "Unauthorized" }, 401);

  await db.delete(oauthToken).where(eq(oauthToken.provider, "google"));
  return c.json({ ok: true });
});

export default app;
