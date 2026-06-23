/// <reference types="@cloudflare/workers-types" />
import app from "@/lib/hono-app";
import { withRequestDb } from "@/lib/db";
import { withRequestNeon } from "@/lib/neon-db";

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
        // postgres.js + Hyperdrive で間欠的に "Network connection lost" が出るので
        // 1 回だけ自動 retry。retry は新しい client (新しい withRequestDb scope) で走る。
        // POST/PUT/DELETE はリクエスト body を一度読むと再利用できないため retry 不可。
        // GET / HEAD のみ retry し、それ以外は素直にエラーを返す。
        const canRetry = request.method === "GET" || request.method === "HEAD";
        const run = () => withRequestDb(() => withRequestNeon(() => app.fetch(request, env, ctx)));
        try {
          return (await run()) as Response;
        } catch (e) {
          const msg = e instanceof Error ? `${e.message} ${e.cause instanceof Error ? e.cause.message : ""}` : String(e);
          if (canRetry && msg.includes("Network connection lost")) {
            return (await run()) as Response;
          }
          return new Response(JSON.stringify({ error: msg }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      }
      return withRequestNeon(() => app.fetch(request, env, ctx));
    }

    // Everything else → static assets (with SPA fallback)
    return env.ASSETS.fetch(request);
  },
};
