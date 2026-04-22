/// <reference types="@cloudflare/workers-types" />
import app from "@/lib/hono-app";

interface Env {
  [key: string]: unknown;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // Populate process.env from CF bindings so existing code works unchanged
    for (const [key, value] of Object.entries(env)) {
      if (typeof value === "string") {
        (globalThis as any).process ??= { env: {} };
        (globalThis as any).process.env[key] = value;
      }
    }

    // API routes → Hono
    // Static assets and SPA fallback are handled by [assets] in wrangler.toml
    return app.fetch(request, env, ctx);
  },
};
