/**
 * Tetris ブロック凡例。Review / Backlog / Throughput で共通利用。
 * - fill: 塗りつぶしの色サンプル
 * - ring: 破線枠の警告サンプル (Backlog の Over budget / Overflow)
 */

export type LegendEntry =
  | { kind: "fill"; label: string; color: string }
  | { kind: "ring"; label: string; color: string };

export function BlockLegend({ entries }: { entries: LegendEntry[] }) {
  const pill = "inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border text-muted-foreground whitespace-nowrap";
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {entries.map((e) => (
        <span key={e.label} className={pill}>
          {e.kind === "fill" ? (
            <span className="size-2 rounded-sm" style={{ background: e.color }}/>
          ) : (
            <span className="size-2 rounded-sm border-[1.5px]" style={{ borderColor: e.color, borderStyle: "dashed" }}/>
          )}
          {e.label}
        </span>
      ))}
    </div>
  );
}
