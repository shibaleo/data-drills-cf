/// <reference types="@cloudflare/workers-types" />
import app from "@/lib/hono-app";

interface Env {
  ASSETS: Fetcher;
  HYPERDRIVE: { connectionString: string };
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

    // Override DATABASE_URL with Hyperdrive connection string
    if (env.HYPERDRIVE) {
      (globalThis as any).process.env.DATABASE_URL = env.HYPERDRIVE.connectionString;
    }

    const url = new URL(request.url);

    // API routes → Hono
    if (url.pathname.startsWith("/api/")) {
      return app.fetch(request, env, ctx);
    }

    // Everything else → static assets (with SPA fallback)
    return env.ASSETS.fetch(request);
  },
};
