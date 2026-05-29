/// <reference types="@cloudflare/workers-types" />
import app from "@/lib/hono-app";
import { withRequestDb } from "@/lib/db";

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
    // 本番 (Hyperdrive あり) のみ per-request DB client。ローカル dev は globalThis 共有 client を使うため
    // withRequestDb をスキップする (毎リクエスト postgres client を作って .end() すると Supabase 接続上限を消費する)
    if (url.pathname.startsWith("/api/")) {
      if (env.HYPERDRIVE) {
        return withRequestDb(() => app.fetch(request, env, ctx)) as Promise<Response>;
      }
      return app.fetch(request, env, ctx);
    }

    // Everything else → static assets (with SPA fallback)
    return env.ASSETS.fetch(request);
  },
};
