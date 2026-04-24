import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { authenticate } from "@/lib/auth";
import { db } from "@/lib/db";
import { oauthToken, problemFile } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getValidAccessToken } from "@/lib/google-oauth";
import { driveLinkInputSchema } from "@/lib/schemas/drive";

const DRIVE_API = "https://www.googleapis.com/drive/v3";

const app = new Hono()
  /**
   * GET /file?id={gdrive_file_id} — Proxy PDF content from Google Drive
   */
  .get("/file", async (c) => {
    const fileId = c.req.query("id");
    if (!fileId) return c.json({ error: "Missing id" }, 400);

    const authResult = await authenticate(c.req.raw);
    if (!authResult) return c.json({ error: "Unauthorized" }, 401);

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

    try {
      const metaRes = await fetch(`${DRIVE_API}/files/${fileId}?fields=trashed`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!metaRes.ok) {
        if (metaRes.status === 404) {
          await db.delete(problemFile).where(eq(problemFile.gdriveFileId, fileId));
          return c.json({ error: "File not found on Google Drive", deleted: true }, 404);
        }
        throw new Error(`Drive API error: ${metaRes.status}`);
      }
      const meta = await metaRes.json() as { trashed?: boolean };
      if (meta.trashed) {
        await db.delete(problemFile).where(eq(problemFile.gdriveFileId, fileId));
        return c.json({ error: "File is in trash", deleted: true }, 404);
      }

      const res = await fetch(`${DRIVE_API}/files/${fileId}?alt=media`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error(`Drive download error: ${res.status}`);

      return new Response(await res.arrayBuffer(), {
        headers: {
          "Content-Type": "application/pdf",
          "Cache-Control": "private, max-age=3600",
        },
      });
    } catch (err: unknown) {
      console.error("[drive/file] Error fetching file:", fileId, err);
      return c.json({ error: "Failed to fetch file" }, 500);
    }
  })
  /**
   * POST /link — Link a Google Drive file to a problem
   */
  .post("/link", zValidator("json", driveLinkInputSchema), async (c) => {
    const authResult = await authenticate(c.req.raw);
    if (!authResult) return c.json({ error: "Unauthorized" }, 401);

    const { problemId, gdriveFileId, fileName, problemPages } = c.req.valid("json");

    const existing = await db
      .select({ id: problemFile.id })
      .from(problemFile)
      .where(eq(problemFile.problemId, problemId))
      .limit(1);

    const values = {
      gdriveFileId,
      fileName,
      ...(problemPages !== undefined ? { problemPages: problemPages ?? null } : {}),
    };

    if (existing.length > 0) {
      await db
        .update(problemFile)
        .set(values)
        .where(eq(problemFile.id, existing[0].id));
    } else {
      await db.insert(problemFile).values({
        problemId,
        ...values,
      });
    }

    return c.json({ ok: true, fileName });
  });

export default app;
