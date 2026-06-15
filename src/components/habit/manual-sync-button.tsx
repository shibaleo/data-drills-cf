import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  /** Worker /api/v1/habit-fresh を叩く実体。差し替え可能。 */
  onSync?: () => Promise<void>;
  /** 最終 sync 時刻 (unix sec)。表示と throttle 判定の双方に使う。 */
  lastSyncedAt?: number;
  /** クールダウン秒。Worker 側 KV throttle と一致させる。 */
  cooldownSec?: number;
};

const DEFAULT_COOLDOWN = 240;  // 4 min

function formatAgo(sec: number): string {
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)} min ago`;
  return `${Math.floor(sec / 3600)} h ago`;
}

export function ManualSyncButton({
  onSync,
  lastSyncedAt,
  cooldownSec = DEFAULT_COOLDOWN,
}: Props) {
  const [busy, setBusy] = useState(false);
  const now = Math.floor(Date.now() / 1000);
  const ageSec = lastSyncedAt ? now - lastSyncedAt : null;
  const remaining = lastSyncedAt ? Math.max(0, cooldownSec - (now - lastSyncedAt)) : 0;
  const disabled = busy || remaining > 0;

  async function handleClick() {
    if (!onSync || disabled) return;
    setBusy(true);
    try {
      await onSync();
    } finally {
      setBusy(false);
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
        <RefreshCw className={cn("size-3.5", busy && "animate-spin")} />
        {remaining > 0 ? `${remaining}s` : "Refresh"}
      </Button>
    </div>
  );
}
