/**
 * Tetris ブロック凡例。Review / Backlog / Throughput で共通利用。
 * - fill: 塗りつぶしの色サンプル
 * - ring: 破線枠の警告サンプル (Backlog の Over budget / Overflow)
 *
 * onClick が指定された entry はフィルタショートカットとして振る舞う。
 * active=true で「このフィルタが有効」状態を強調表示する。
 */

export type LegendEntry = {
  kind: "fill" | "ring";
  label: string;
  color: string;
  active?: boolean;
  onClick?: () => void;
};

export function BlockLegend({ entries }: { entries: LegendEntry[] }) {
  const baseCls = "inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border whitespace-nowrap transition-colors";
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {entries.map((e) => {
        const swatch = e.kind === "fill" ? (
          <span className="size-2 rounded-sm" style={{ background: e.color }}/>
        ) : (
          <span className="size-2 rounded-sm border-[1.5px]" style={{ borderColor: e.color, borderStyle: "dashed" }}/>
        );
        if (e.onClick) {
          const stateCls = e.active
            ? "bg-accent text-foreground border-foreground/30"
            : "text-muted-foreground hover:bg-muted";
          return (
            <button key={e.label} type="button" onClick={e.onClick}
              className={`${baseCls} cursor-pointer ${stateCls}`}>
              {swatch}{e.label}
            </button>
          );
        }
        return (
          <span key={e.label} className={`${baseCls} text-muted-foreground`}>
            {swatch}{e.label}
          </span>
        );
      })}
    </div>
  );
}
