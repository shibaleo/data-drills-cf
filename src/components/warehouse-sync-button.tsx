/**
 * data-warehouse on-demand sync ボタンの共通コンポーネント。
 *
 * UX:
 *  - クリックで該当 target を kick (toast は useWarehouseSync 内部で発火)
 *  - 直前 sync 成功時刻を localStorage (target 別) に持ち、cooldown を全ページで共有
 *  - server 側 sync 時刻 (例: habits の cells.synced_at) が新しければそちらを採用
 *
 * 呼び出し側は target を渡すだけ。各ページで cooldown 表示 / 連打防止が一貫する。
 */

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useWarehouseSync, type SyncTarget } from "@/hooks/queries/use-warehouse-sync";

type Props = {
  target: SyncTarget;
  /** server-truthful な最終 sync 時刻 (unix sec)。localStorage と max を取る。 */
  serverLastSyncedAt?: number;
  /** クールダウン秒。GAS LockService と二重 throttle になる。 */
  cooldownSec?: number;
  /** Button ラベル。デフォルトは "Sync {target}"。 */
  label?: string;
};

const DEFAULT_COOLDOWN = 240;  // 4 min
const STORAGE_PREFIX = "dd:warehouse-sync:lastAt:";

function formatAgo(sec: number): string {
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)} min ago`;
  return `${Math.floor(sec / 3600)} h ago`;
}

function readPersisted(target: SyncTarget): number | undefined {
  if (typeof window === "undefined") return undefined;
  const v = window.localStorage.getItem(STORAGE_PREFIX + target);
  if (!v) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export function WarehouseSyncButton({
  target,
  serverLastSyncedAt,
  cooldownSec = DEFAULT_COOLDOWN,
  label,
}: Props) {
  const warehouseSync = useWarehouseSync();
  const [persistedAt, setPersistedAt] = useState<number | undefined>(() => readPersisted(target));
  // 1 秒 tick で cooldown countdown を更新
  const [, setNow] = useState(Math.floor(Date.now() / 1000));

  // target が変わったら localStorage から読み直し
  useEffect(() => {
    setPersistedAt(readPersisted(target));
  }, [target]);

  // cooldown 中だけ 1 秒間隔で再描画 (countdown 表示)
  const candidates = [persistedAt, serverLastSyncedAt].filter((v): v is number => typeof v === "number");
  const effectiveLastSyncedAt = candidates.length ? Math.max(...candidates) : undefined;
  const now = Math.floor(Date.now() / 1000);
  const remaining = effectiveLastSyncedAt ? Math.max(0, cooldownSec - (now - effectiveLastSyncedAt)) : 0;
  useEffect(() => {
    if (remaining <= 0) return;
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, [remaining]);

  const ageSec = effectiveLastSyncedAt ? now - effectiveLastSyncedAt : null;
  const isBusy = warehouseSync.isPending;
  const disabled = isBusy || remaining > 0;
  const buttonLabel = label ?? `Sync ${target}`;

  async function handleClick() {
    if (disabled) return;
    const r = await warehouseSync.mutateAsync({ target }).catch(() => null);
    if (r?.ok) {
      const t = Math.floor(Date.now() / 1000);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(STORAGE_PREFIX + target, String(t));
      }
      setPersistedAt(t);
    }
  }

  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="text-muted-foreground">
        {ageSec !== null ? `Last synced ${formatAgo(ageSec)}` : "Not synced yet"}
      </span>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={disabled}
        onClick={handleClick}
        className="gap-1.5"
      >
        <RefreshCw className={cn("size-3.5", isBusy && "animate-spin")} />
        {remaining > 0 ? `${remaining}s` : buttonLabel}
      </Button>
    </div>
  );
}
