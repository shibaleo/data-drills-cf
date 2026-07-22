import { Hono } from "hono";
import { authenticate, type AuthResult } from "@/lib/auth";
import { publicConfig } from "@/lib/public-config";
import { db } from "@/lib/db";
import { oauthToken } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { getAuthUrl, exchangeCode, getValidAccessToken } from "@/lib/google-oauth";

type Env = { Variables: { authResult: AuthResult } };

// すべてのハンドラで authResult を期待する。/callback も Google からのリダイレクト時に
// ブラウザが Clerk セッション cookie を付けるので、同じ middleware で通せる。
const app = new Hono<Env>()
  .use("*", async (c, next) => {
    const result = await authenticate(c.req.raw);
    if (!result) return c.json({ error: "Unauthorized" }, 401);
    c.set("authResult", result);
    await next();
  })
  .get("/", async (c) => {
    return c.redirect(getAuthUrl());
  })
  .get("/callback", async (c) => {
    const code = c.req.query("code");
    if (!code) return c.json({ error: "Missing code" }, 400);
    const userId = c.get("authResult").userId;
    const baseUrl = publicConfig.baseUrl;

    try {
      const tokens = await exchangeCode(code);
      const expiresAt = tokens.expires_in
        ? new Date(Date.now() + tokens.expires_in * 1000)
        : null;

      // upsert: (user_id, provider) ユニーク
      const existing = await db
        .select({ id: oauthToken.id })
        .from(oauthToken)
        .where(and(eq(oauthToken.userId, userId), eq(oauthToken.provider, "google")))
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
          userId,
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
  })
  .get("/token", async (c) => {
    const userId = c.get("authResult").userId;
    const [tokens] = await db
      .select()
      .from(oauthToken)
      .where(and(eq(oauthToken.userId, userId), eq(oauthToken.provider, "google")))
      .limit(1);

    if (!tokens) return c.json({ error: "Google Drive not connected" }, 400);

    const accessToken = await getValidAccessToken({
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      token_expires_at: tokens.tokenExpiresAt,
    });

    if (accessToken !== tokens.accessToken) {
      await db
        .update(oauthToken)
        .set({ accessToken, updatedAt: new Date() })
        .where(eq(oauthToken.id, tokens.id));
    }

    return c.json({ accessToken });
  })
  .get("/status", async (c) => {
    const userId = c.get("authResult").userId;
    const rows = await db
      .select({ id: oauthToken.id, updatedAt: oauthToken.updatedAt })
      .from(oauthToken)
      .where(and(eq(oauthToken.userId, userId), eq(oauthToken.provider, "google")))
      .limit(1);

    return c.json({
      connected: rows.length > 0,
      updatedAt: rows[0]?.updatedAt ?? null,
    });
  })
  .post("/disconnect", async (c) => {
    const userId = c.get("authResult").userId;
    await db.delete(oauthToken)
      .where(and(eq(oauthToken.userId, userId), eq(oauthToken.provider, "google")));
    return c.json({ ok: true });
  });

export default app;
