/**
 * data-warehouse GAS sync を CF Worker 経由でキックするフック。
 *
 * 流れ: useAuth().getToken() で fresh Clerk JWT を取得 → Bearer で
 *   POST /api/v1/warehouse/sync → Worker が JWT を GAS に転送 → GAS が
 *   doPost 内で JWKS 検証して該当 sync 関数を実行 → 結果を返す。
 *
 * 詳細設計: data-warehouse/docs/006_on_demand_sync_via_gas_doPost.md
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/react";
import { ApiError } from "@/lib/api-client";

export type SyncTarget = "toggl" | "google_health" | "notion" | "zaim" | "tanita";

export type SyncResponse = {
  /** true: 完走 / false: recoverable な拒否 (重複実行ロック等)。GAS 側で必ず付与される。 */
  ok: boolean;
  /** ok=false の時の理由文字列 (重複・auth 失敗等)。 */
  error?: string;
  target?: SyncTarget;
  synced?: number;
  durationMs?: number;
  _proxyDurationMs?: number;
  // GAS 側 warnings / partial failure などはここに乗せて返す想定 (具体形は GAS 側確定後に narrow)
  [k: string]: unknown;
};

/** 各 target に紐づく query keys を invalidate するためのマップ。
 *  sync 後に該当 source の cache を強制再 fetch させる。 */
function invalidateTargets(qc: ReturnType<typeof useQueryClient>, target: SyncTarget) {
  switch (target) {
    case "toggl":
      qc.invalidateQueries({ queryKey: ["toggl"] });
      qc.invalidateQueries({ queryKey: ["habit-fresh"] });  // toggl 経由で habit cells も更新
      break;
    case "google_health":
      qc.invalidateQueries({ queryKey: ["sleep"] });
      break;
    case "notion":
      qc.invalidateQueries({ queryKey: ["exercise"] });
      break;
    case "zaim":
    case "tanita":
      // 現状 drills 側に該当 query 無し。将来追加時にここを更新。
      break;
  }
}

export function useWarehouseSync() {
  const qc = useQueryClient();
  const { getToken } = useAuth();
  return useMutation<SyncResponse, ApiError, { target: SyncTarget }>({
    mutationFn: async ({ target }) => {
      const token = await getToken();
      if (!token) throw new ApiError(401, { error: "no session token" });
      const res = await fetch("/api/v1/warehouse/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ target }),
      });
      // Worker は body.ok に応じて 200 (完走) / 409 (重複 = recoverable) / 502 (GAS 異常) に振り分ける。
      // 200 以外でも body は読みたい (重複時のメッセージ等) ので一度 parse する。
      let body: unknown = null;
      try { body = await res.json(); } catch { /* keep null */ }
      const obj = (body && typeof body === "object" ? body : {}) as SyncResponse;
      // 5xx は真の障害として throw。409 (ok=false, 重複等) は normal return して呼び出し側で UX 判断。
      if (res.status >= 500) {
        const msg = obj.error ? String(obj.error) : `HTTP ${res.status}`;
        throw new ApiError(res.status, { error: msg });
      }
      // 401 は auth 失敗。throw して呼び出し側で再 sign-in 誘導等。
      if (res.status === 401) {
        throw new ApiError(401, { error: obj.error ?? "unauthorized" });
      }
      return obj;
    },
    onSuccess: (data, { target }) => {
      // ok=true (完走) の時だけ cache invalidate。ok=false (重複拒否) は再 fetch 不要。
      if (data.ok) invalidateTargets(qc, target);
    },
  });
}
