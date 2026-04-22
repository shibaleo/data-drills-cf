import type { MiddlewareHandler } from "hono";

/**
 * Simple API Key authentication middleware.
 * Checks the `x-pdf-service-key` header against PDF_SERVICE_KEY env var.
 */
export function apiKeyAuth(): MiddlewareHandler {
  return async (c, next) => {
    const key = c.req.header("x-pdf-service-key");
    const expected = process.env.PDF_SERVICE_KEY;

    if (!expected) {
      console.warn("PDF_SERVICE_KEY is not set — all requests will be rejected");
      return c.json({ error: "Service misconfigured" }, 500);
    }

    if (key !== expected) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    await next();
  };
}
