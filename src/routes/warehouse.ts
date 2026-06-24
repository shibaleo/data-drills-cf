/**
 * /api/v1/warehouse — data-warehouse (GAS) への on-demand sync proxy。
 *
 * 設計: sync logic 本体は data-warehouse 側 GAS doPost に集約 (warehouse 書き込み権限
 * と upstream API token を持つ唯一の実行環境)。CF Worker は「ブラウザの Clerk JWT を
 * GAS まで届ける薄い中継」として、API surface 一貫性 (/api/v1/*) と timeout 安全装置
 * の役割だけを果たす。詳細: data-warehouse/docs/006_on_demand_sync_via_gas_doPost.md
 *
 * GAS Web App の制約:
 *  - HTTP status code を任意設定できないので、常に 200 を返す
 *  - 成否は body.ok で判定。重複実行も ok=false で返ってくる (失敗ではない)
 *  - Worker は ok を見て妥当な status code に張り直してから client に返す。
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { config } from "@/lib/config";
import type { AuthResult } from "@/lib/auth";

type Env = { Variables: { authResult: AuthResult } };

const syncInputSchema = z.object({
  target: z.enum(["toggl", "google_health", "notion", "zaim", "tanita"]),
});

function extractBearer(req: Request): string | null {
  const h = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!h?.startsWith("Bearer ")) return null;
  const token = h.slice(7);
  // dd_ プレフィックスの API key は GAS 側で検証できないので reject
  if (token.startsWith("dd_")) return null;
  return token;
}

const app = new Hono<Env>()
  .post("/sync", zValidator("json", syncInputSchema), async (c) => {
    const url = config.warehouseSyncUrl;
    const jwt = extractBearer(c.req.raw);
    if (!jwt) return c.json({ error: "Clerk JWT required (Bearer)" }, 401);

    const { target } = c.req.valid("json");
    const start = Date.now();
    let r: Response;
    try {
      r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auth_token: jwt, target }),
        // CF Workers の wall clock 上限が壁。3 min 超なら Lambda 検討シグナル。
        redirect: "follow",
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return c.json({ error: `warehouse sync proxy failed: ${msg}` }, 502);
    }
    // GAS は常に 200 を返すので、body.ok で実際の成否を判定する。
    const body = await r.json().catch(() => null);
    const proxyDurationMs = Date.now() - start;

    if (body === null || typeof body !== "object") {
      return c.json({ error: "non-JSON response from GAS", _proxyDurationMs: proxyDurationMs }, 502);
    }
    const obj = body as Record<string, unknown>;
    const merged = { ...obj, _proxyDurationMs: proxyDurationMs };

    // body.ok の真偽で client に返す status を張り直し:
    //  ok === true  → 200 (sync 完了)
    //  ok === false → 409 (重複実行など、recoverable な拒否)
    //  ok 不在 / 想定外 → 502 (GAS 仕様逸脱)
    if (obj.ok === true) return c.json(merged, 200);
    if (obj.ok === false) return c.json(merged, 409);
    return c.json(merged, 502);
  });

export default app;
