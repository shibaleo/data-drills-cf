"use client";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useScopes } from "@/hooks/queries/use-scopes";
import { useField } from "@/hooks/use-field";
import { usePageTitle } from "@/lib/page-context";
import { Plus } from "lucide-react";

/**
 * Scopes hub — pointy-top hex grid.
 *
 * 背景は小六角の honeycomb。各 scope は 1 辺 = 小六角 6 マス分の大六角として
 * 配置される。hover で 6 辺それぞれの外側に Edit/Review/Throughput/Plan/Stats/
 * Digest ボタンが現れ、該当ページへ navigate する hub になる。
 */

const SQRT3 = Math.sqrt(3);
// 大六角の 1 辺 (px)。背景の小六角は SIDE / 6
const SIDE = 60;
const SMALL_SIDE = SIDE / 6;
const HEX_W = SQRT3 * SIDE;
const HEX_H = 2 * SIDE;
const INRADIUS = (SIDE * SQRT3) / 2;
const BUTTON_OFFSET = 14; // 辺中点から外側に押し出す距離
const COLS_MAX = 4;
const GAP_X = 80;
const GAP_Y = 60;
const PAD = 70;

function hexPoints(cx: number, cy: number, side: number) {
  return [
    [cx, cy - side],
    [cx + (SQRT3 * side) / 2, cy - side / 2],
    [cx + (SQRT3 * side) / 2, cy + side / 2],
    [cx, cy + side],
    [cx - (SQRT3 * side) / 2, cy + side / 2],
    [cx - (SQRT3 * side) / 2, cy - side / 2],
  ]
    .map(([x, y]) => `${x},${y}`)
    .join(" ");
}

// 6 辺の外向き unit normal + ラベル + 遷移先。
// pointy-top: 上下は頂点。辺は NW/NE/E/SE/SW/W の 6 つ。
type EdgeDef = {
  nx: number;
  ny: number;
  label: string;
  /** Edit は /scopes/$id、それ以外は /[view]?scope_id= */
  view: "edit" | "review" | "throughput" | "plan" | "stats" | "digest";
};
const EDGES: EdgeDef[] = [
  { nx: -0.5, ny: -SQRT3 / 2, label: "Edit", view: "edit" },
  { nx: 0.5, ny: -SQRT3 / 2, label: "Review", view: "review" },
  { nx: 1, ny: 0, label: "Throughput", view: "throughput" },
  { nx: 0.5, ny: SQRT3 / 2, label: "Plan", view: "plan" },
  { nx: -0.5, ny: SQRT3 / 2, label: "Stats", view: "stats" },
  { nx: -1, ny: 0, label: "Digest", view: "digest" },
];

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

export default function ScopesHubPage() {
  usePageTitle("Scopes");
  const { setCurrentScopeId } = useField();
  const { data: scopes = [] } = useScopes();
  const navigate = useNavigate();
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // 配置: COLS_MAX 列でグリッド (新規 + 件分)。scope 数が少ない時は自然に左寄せ
  const total = scopes.length + 1; // +1 = New ボタン
  const cols = Math.min(COLS_MAX, Math.max(1, total));
  const rows = Math.ceil(total / cols);

  const positions = useMemo(() => {
    return scopes.map((s, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cx = PAD + HEX_W / 2 + col * (HEX_W + GAP_X);
      const cy = PAD + SIDE + row * (HEX_H + GAP_Y);
      return { scope: s, cx, cy };
    });
  }, [scopes, cols]);

  const newPos = useMemo(() => {
    const col = scopes.length % cols;
    const row = Math.floor(scopes.length / cols);
    return {
      cx: PAD + HEX_W / 2 + col * (HEX_W + GAP_X),
      cy: PAD + SIDE + row * (HEX_H + GAP_Y),
    };
  }, [scopes.length, cols]);

  const width = PAD * 2 + cols * HEX_W + (cols - 1) * GAP_X;
  const height = PAD * 2 + rows * HEX_H + (rows - 1) * GAP_Y;

  // 背景 honeycomb (装飾)
  const bgHexes = useMemo(() => {
    const cellW = SQRT3 * SMALL_SIDE;
    const cellH = 1.5 * SMALL_SIDE;
    const totalCols = Math.ceil(width / cellW) + 2;
    const totalRows = Math.ceil(height / cellH) + 2;
    const out: { cx: number; cy: number; key: string }[] = [];
    for (let r = 0; r < totalRows; r++) {
      for (let c = 0; c < totalCols; c++) {
        const cx = c * cellW + (r % 2) * (cellW / 2);
        const cy = r * cellH;
        out.push({ cx, cy, key: `${r}-${c}` });
      }
    }
    return out;
  }, [width, height]);

  function onEdgeClick(scopeId: string, view: EdgeDef["view"]) {
    setCurrentScopeId(scopeId);
    if (view === "edit") {
      navigate({ to: "/scopes/$scope_id" as string, params: { scope_id: scopeId } });
    } else {
      navigate({ to: `/${view}` as string, search: { scope_id: scopeId } });
    }
  }

  return (
    <div className="overflow-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        className="block mx-auto"
        style={{ maxWidth: "100%" }}
      >
        {/* 背景: 小六角 honeycomb */}
        <g className="stroke-muted-foreground/15 fill-none" strokeWidth={0.5}>
          {bgHexes.map((h) => (
            <polygon key={h.key} points={hexPoints(h.cx, h.cy, SMALL_SIDE)} />
          ))}
        </g>

        {/* 各 scope hex */}
        {positions.map(({ scope, cx, cy }) => {
          const hovered = hoveredId === scope.id;
          // 透明な大きめ六角で hover 領域を確保 (ボタンが現れるエリアも含む)
          const hitSide = SIDE + BUTTON_OFFSET + 16;
          return (
            <g
              key={scope.id}
              onMouseEnter={() => setHoveredId(scope.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              {/* hit region (transparent) */}
              <polygon
                points={hexPoints(cx, cy, hitSide)}
                fill="transparent"
                pointerEvents="all"
              />
              {/* visible hex */}
              <polygon
                points={hexPoints(cx, cy, SIDE)}
                className={
                  hovered
                    ? "fill-accent stroke-primary transition-all"
                    : "fill-card stroke-border transition-all"
                }
                strokeWidth={1.5}
              />
              <text
                x={cx}
                y={cy}
                textAnchor="middle"
                dominantBaseline="central"
                className="fill-foreground text-[11px] font-semibold pointer-events-none select-none"
              >
                {truncate(scope.name, 9)}
              </text>
              {hovered && (
                <g>
                  {EDGES.map((edge) => {
                    const dist = INRADIUS + BUTTON_OFFSET;
                    const bx = cx + edge.nx * dist;
                    const by = cy + edge.ny * dist;
                    return (
                      <EdgeButton
                        key={edge.label}
                        cx={bx}
                        cy={by}
                        label={edge.label}
                        onClick={() => onEdgeClick(scope.id, edge.view)}
                      />
                    );
                  })}
                </g>
              )}
            </g>
          );
        })}

        {/* New scope ボタン */}
        <g>
          <Link to={"/scopes/new" as string}>
            <polygon
              points={hexPoints(newPos.cx, newPos.cy, SIDE)}
              className="fill-card stroke-dashed stroke-muted-foreground/60 hover:fill-accent transition-colors cursor-pointer"
              strokeWidth={1.5}
              strokeDasharray="4 3"
            />
          </Link>
          <Plus
            x={newPos.cx - 10}
            y={newPos.cy - 10}
            width={20}
            height={20}
            className="fill-none stroke-muted-foreground pointer-events-none"
          />
        </g>
      </svg>
    </div>
  );
}

function EdgeButton({
  cx,
  cy,
  label,
  onClick,
}: {
  cx: number;
  cy: number;
  label: string;
  onClick: () => void;
}) {
  const W = 66;
  const H = 20;
  return (
    <foreignObject x={cx - W / 2} y={cy - H / 2} width={W} height={H}>
      <button
        type="button"
        onClick={onClick}
        className="w-full h-full text-[10px] font-semibold rounded border bg-popover/95 backdrop-blur px-1 leading-none hover:bg-primary hover:text-primary-foreground hover:border-primary shadow-sm"
      >
        {label}
      </button>
    </foreignObject>
  );
}
