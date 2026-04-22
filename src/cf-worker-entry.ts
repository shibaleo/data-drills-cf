import app from "@/lib/hono-app";

interface Env {
  ASSETS: { fetch: (request: Request) => Promise<Response> };
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

    const url = new URL(request.url);

    // API routes → Hono
    if (url.pathname.startsWith("/api")) {
      return app.fetch(request, env, ctx);
    }

    // Static assets
    const assetResponse = await env.ASSETS.fetch(request);
    if (assetResponse.status !== 404) return assetResponse;

    // SPA fallback → index.html
    return env.ASSETS.fetch(new Request(new URL("/index.html", request.url), request));
  },
};
