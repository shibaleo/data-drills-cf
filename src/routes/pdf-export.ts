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

    // On error, forward the upstream error body as JSON
    if (!res.ok) {
      const errorText = await res.text().catch(() => "");
      return c.json(
        { error: errorText || `PDF service returned ${res.status}` },
        500,
      );
    }

    // Buffer the entire PDF in CF Worker before responding. Streaming
    // through with raw upstream headers caused intermittent client-side
    // failures (idle disconnects during Render cold-start, header/encoding
    // mismatches across browsers).
    const buffer = await res.arrayBuffer();
    const contentType =
      res.headers.get("content-type") ?? "application/pdf";
    const contentDisposition =
      res.headers.get("content-disposition") ??
      'attachment; filename="exported.pdf"';

    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": contentDisposition,
        "Content-Length": String(buffer.byteLength),
      },
    });
  });

export default app;
