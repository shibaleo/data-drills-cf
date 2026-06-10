/**
 * Tetris ブロック凡例 + select-only filter。
 * - fill: 塗りつぶしの色サンプル
 * - ring: 破線枠の警告サンプル (Backlog の Over budget / Overflow)
 *
 * active=true で「このカテゴリは現在表示中」(明るい)、active=false で「非表示中」
 * (暗い)。caller 側で「filter set が empty なら全 active = 全表示」のロジックを
 * 入れる前提。
 */

export type LegendEntry = {
  kind: "fill" | "ring";
  label: string;
  color: string;
  /** true = 表示中 (明るい), false = 非表示中 (暗い)。 */
  active?: boolean;
  onClick?: () => void;
};

export function BlockLegend({ entries }: { entries: LegendEntry[] }) {
  const baseCls = "inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border whitespace-nowrap transition-colors";
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {entries.map((e) => {
        const swatchOpacity = e.onClick && e.active === false ? 0.35 : 1;
        const swatch = e.kind === "fill" ? (
          <span className="size-2 rounded-sm" style={{ background: e.color, opacity: swatchOpacity }}/>
        ) : (
          <span className="size-2 rounded-sm border-[1.5px]" style={{ borderColor: e.color, borderStyle: "dashed", opacity: swatchOpacity }}/>
        );
        if (e.onClick) {
          // 明るい=表示中 (active=true)、暗い=非表示中 (active=false)。
          const stateCls = e.active
            ? "text-foreground border-border hover:bg-muted"
            : "text-muted-foreground/40 border-border/40 hover:text-muted-foreground";
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
