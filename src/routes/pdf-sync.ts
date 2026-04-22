/**
 * PDF Sync — proxy to PDF service (Render) for PDF processing.
 *
 * CF Worker does not bundle pdfjs-dist / pdf-lib / fonts.
 * All PDF operations are forwarded to the external PDF service.
 */
import { Hono } from "hono";

const app = new Hono();

/** Forward a PDF-sync request to the PDF service */
async function proxyToPdfService(
  c: { req: { raw: Request }; json: (body: unknown, status?: number) => Response },
  subpath: string,
) {
  const pdfApiUrl = process.env.PDF_API_URL;
  if (!pdfApiUrl) {
    return c.json({ error: "PDF_API_URL is not configured" }, 500);
  }

  const target = `${pdfApiUrl}/api/v1/pdf-sync/${subpath}`;
  const res = await fetch(target, {
    method: c.req.raw.method,
    headers: {
      ...Object.fromEntries(c.req.raw.headers.entries()),
      "x-pdf-service-key": process.env.PDF_SERVICE_KEY || "",
    },
    body: c.req.raw.body,
    // @ts-expect-error — CF Workers support duplex
    duplex: "half",
  });

  return new Response(res.body, {
    status: res.status,
    headers: res.headers,
  });
}

app.post("/scan", (c) => proxyToPdfService(c, "scan"));
app.post("/apply", (c) => proxyToPdfService(c, "apply"));
app.post("/export", (c) => proxyToPdfService(c, "export"));

export default app;
