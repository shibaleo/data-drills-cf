"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { StabilitySlider } from "@/components/stability-slider";

/**
 * scope.status_stabilities (= status name → days の override マップ) を編集する
 * 共有パネル。/scopes/$scopeId と /plan から使う。
 *
 * UI は review ページの slider 帯と揃え (右上 reset/save、下段に StabilitySlider)、
 * バックエンドは「特定 scope の override 上書き」という自然な意味論を維持する
 * (= 他 scope や global status には波及しない)。
 */
export function ScopeFSRSOverridePanel({
  statuses,
  current,
  disabled,
  onSave,
}: {
  statuses: { id: string; name: string; color: string | null; stabilityDays: number }[];
  current: Record<string, number>;
  disabled?: boolean;
  onSave: (next: Record<string, number>) => Promise<unknown>;
}) {
  const [local, setLocal] = useState<Record<string, number>>(current);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setLocal(current); }, [current]);
  const dirty = JSON.stringify(local) !== JSON.stringify(current);

  const overrides = useMemo(() => {
    const m = new Map<string, number>();
    for (const [k, v] of Object.entries(local)) m.set(k, v);
    return m;
  }, [local]);

  const sliderStatuses = useMemo(
    () => statuses.map((s) => ({ name: s.name, color: s.color, stabilityDays: s.stabilityDays })),
    [statuses],
  );
  const sliderMax = useMemo(() => {
    const peak = Math.max(30, ...statuses.map((s) => s.stabilityDays), ...Object.values(local));
    return Math.ceil(Math.max(240, peak) / 10) * 10;
  }, [statuses, local]);

  if (sliderStatuses.length === 0) return null;

  return (
    <div className="relative">
      {dirty && (
        <div className="absolute right-0 top-0 flex items-center gap-2 z-10">
          <button type="button"
            disabled={saving || disabled}
            className="text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-40"
            onClick={() => setLocal(current)}>reset</button>
          <button type="button"
            disabled={saving || disabled}
            className="text-[10px] text-primary hover:underline disabled:opacity-40"
            onClick={async () => {
              setSaving(true);
              try { await onSave(local); toast.success("FSRS パラメタを保存"); }
              catch (e) { toast.error(e instanceof Error ? e.message : "保存失敗"); }
              finally { setSaving(false); }
            }}>save</button>
        </div>
      )}
      <div className="px-2">
        <StabilitySlider
          statuses={sliderStatuses}
          overrides={overrides}
          max={sliderMax}
          onChange={(name, v) => setLocal((prev) => ({ ...prev, [name]: Math.max(0, v) }))}
        />
      </div>
    </div>
  );
}
