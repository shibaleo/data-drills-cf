/**
 * PDF Export — proxy to the external PDF service for read-only combined
 * PDF generation (no scan / no write-back). Scan & apply workflows are
 * intentionally not exposed here; run those as an external pipeline that
 * writes to data-drills via the standard problems/problem_files API.
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

export const pdfExportInputSchema = z.object({
  problem_ids: z.array(z.string().uuid()).min(1),
});

const app = new Hono()
  .post("/", zValidator("json", pdfExportInputSchema), async (c) => {
    const pdfApiUrl = process.env.PDF_API_URL;
    if (!pdfApiUrl) {
      return c.json({ error: "PDF_API_URL is not configured" }, 500);
    }
    const body = c.req.valid("json");
    const res = await fetch(`${pdfApiUrl}/api/v1/pdf-sync/export`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-pdf-service-key": process.env.PDF_SERVICE_KEY || "",
      },
      body: JSON.stringify(body),
    });
    return new Response(res.body, {
      status: res.status,
      headers: res.headers,
    });
  });

export default app;
