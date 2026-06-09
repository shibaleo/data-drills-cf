"use client";
import { useMemo, useState, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useScopes, useUpdateScope, type ScopeRow } from "@/hooks/queries/use-scopes";
import { useField } from "@/hooks/use-field";
import { useFields } from "@/hooks/queries/use-field-data";
import { usePageTitle, useHeaderSlot } from "@/lib/page-context";
import { useReviewList } from "@/hooks/queries/use-review";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { MemberFilterPicker } from "@/components/member-filter-picker";
import type { MemberFilterInput } from "@/lib/schemas/member-filter";

/**
 * Scopes hub — pointy-top hex grid + radial wheel menu。
 *
 * - 背景: SVG <pattern> で小六角 honeycomb をビューポート全域にタイル。1 重輪郭
 * - 大六角: 1 辺 = SMALL_SIDE × 8。**top vertex** が小六角の top vertex に snap
 * - hover: 6 個の annular sector が出現し Edit/Review/Throughput/Plan/Stats/Digest
 */

const SQRT3 = Math.sqrt(3);
// 小六角: tetris CELL=14 とおおむね同じ視覚サイズ (hex width = SQRT3*8 ≈ 13.86)
const SMALL_SIDE = 8;
// SIDE = SMALL_SIDE * 6 (= 48): 全 6 頂点が小六角の top vertex に snap する整合値。
// これで大六角の 6 辺それぞれが小六角の vertex を 6 個結ぶまっすぐな線になり、
// グリッドとの一体感が出る。
const SIDE = 48;
const CELL_W = SQRT3 * SMALL_SIDE;
const CELL_H = 1.5 * SMALL_SIDE;

// 放射状メニュー
const MENU_INNER_R = SIDE + 4;
const MENU_OUTER_R = MENU_INNER_R + 20;

// 大六角の top vertex を「小六角の top vertex」に snap (= 全 6 頂点が snap)
const ANCHOR_COL_T = 9;
const ANCHOR_ROW_T = 8;
const COL_STEP_T = 11;
const ROW_STEP_T = 14; // 要 even
const COLS_MAX = 3;

function hexPoints(cx: number, cy: number, side: number): string {
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

function bigCenterAt(idx: number, cols: number): { cx: number; cy: number } {
  const col = idx % cols;
  const row = Math.floor(idx / cols);
  const col_T = ANCHOR_COL_T + col * COL_STEP_T;
  const row_T = ANCHOR_ROW_T + row * ROW_STEP_T;
  // top vertex 位置 (小六角 (col_T, row_T) の top vertex):
  //   x = col_T * CELL_W + (row_T % 2) * CELL_W/2
  //   y = row_T * CELL_H - SMALL_SIDE
  const tx = col_T * CELL_W + (row_T & 1) * (CELL_W / 2);
  const ty = row_T * CELL_H - SMALL_SIDE;
  return { cx: tx, cy: ty + SIDE };
}

function annularSector(
  cx: number,
  cy: number,
  innerR: number,
  outerR: number,
  startDeg: number,
  endDeg: number,
): string {
  const a1 = (startDeg * Math.PI) / 180;
  const a2 = (endDeg * Math.PI) / 180;
  const x1o = cx + outerR * Math.cos(a1);
  const y1o = cy + outerR * Math.sin(a1);
  const x2o = cx + outerR * Math.cos(a2);
  const y2o = cy + outerR * Math.sin(a2);
  const x1i = cx + innerR * Math.cos(a1);
  const y1i = cy + innerR * Math.sin(a1);
  const x2i = cx + innerR * Math.cos(a2);
  const y2i = cy + innerR * Math.sin(a2);
  return [
    `M ${x1o} ${y1o}`,
    `A ${outerR} ${outerR} 0 0 1 ${x2o} ${y2o}`,
    `L ${x2i} ${y2i}`,
    `A ${innerR} ${innerR} 0 0 0 ${x1i} ${y1i}`,
    "Z",
  ].join(" ");
}

type SectorDef = {
  startDeg: number;
  endDeg: number;
  label: string;
  view: "edit" | "review" | "throughput" | "plan" | "stats" | "digest";
  color: string;
};

const SECTORS: SectorDef[] = [
  { startDeg: -150, endDeg: -90, label: "Edit", view: "edit", color: "#64748b" },
  { startDeg: -90, endDeg: -30, label: "Review", view: "review", color: "#0ea5e9" },
  { startDeg: -30, endDeg: 30, label: "Throughput", view: "throughput", color: "#f59e0b" },
  { startDeg: 30, endDeg: 90, label: "Plan", view: "plan", color: "#8b5cf6" },
  { startDeg: 90, endDeg: 150, label: "Stats", view: "stats", color: "#10b981" },
  { startDeg: 150, endDeg: 210, label: "Digest", view: "digest", color: "#f43f5e" },
];

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

type ScopeStats = {
  /** filter にマッチする members の総数 */
  total: number;
  active: number;
  overdue: number;
  dueToday: number;
  pending: number;
  goodPct: number;
  nextDue: number | null;
};

type ReviewRow = {
  answerCount: number;
  daysUntil: number;
  fieldId: string;
  subjectId: string | null;
  levelId: string | null;
};

function filterRowsByScope(
  rows: ReviewRow[],
  filter: { fieldIds?: string[]; subjectIds?: string[]; levelIds?: string[] },
): ReviewRow[] {
  const fieldSet = filter.fieldIds?.length ? new Set(filter.fieldIds) : null;
  const subjectSet = filter.subjectIds?.length ? new Set(filter.subjectIds) : null;
  const levelSet = filter.levelIds?.length ? new Set(filter.levelIds) : null;
  return rows.filter((r) => {
    if (fieldSet && !fieldSet.has(r.fieldId)) return false;
    if (subjectSet && (!r.subjectId || !subjectSet.has(r.subjectId))) return false;
    if (levelSet && (!r.levelId || !levelSet.has(r.levelId))) return false;
    return true;
  });
}

function computeStats(rows: { answerCount: number; daysUntil: number }[]): ScopeStats {
  let active = 0;
  let overdue = 0;
  let dueToday = 0;
  let nextDue: number | null = null;
  for (const r of rows) {
    if (r.answerCount > 0) {
      active++;
      if (r.daysUntil < 0) overdue++;
      else if (r.daysUntil === 0) dueToday++;
      else if (nextDue === null || r.daysUntil < nextDue) nextDue = r.daysUntil;
    }
  }
  const pending = overdue + dueToday;
  const goodPct = active > 0 ? ((active - pending) / active) * 100 : 0;
  return { total: rows.length, active, overdue, dueToday, pending, goodPct, nextDue };
}

function heatColor(stats: ScopeStats): { glow: string; ring: string; label: string } {
  if (stats.pending === 0) {
    return { glow: "rgba(16,185,129,0.55)", ring: "#10b981", label: stats.active > 0 ? "✓ clear" : "—" };
  }
  if (stats.pending < 6) {
    return { glow: "rgba(245,158,11,0.55)", ring: "#f59e0b", label: `${stats.pending} due` };
  }
  return { glow: "rgba(239,68,68,0.6)", ring: "#ef4444", label: `${stats.pending} due!` };
}

function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  const a1 = (startDeg * Math.PI) / 180;
  const a2 = (endDeg * Math.PI) / 180;
  const x1 = cx + r * Math.cos(a1);
  const y1 = cy + r * Math.sin(a1);
  const x2 = cx + r * Math.cos(a2);
  const y2 = cy + r * Math.sin(a2);
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`;
}

export default function ScopesHubPage() {
  usePageTitle("Scopes");
  const renderHeaderSlot = useHeaderSlot();
  const { currentScopeId, setCurrentScopeId } = useField();
  const { data: scopes = [] } = useScopes();
  const navigate = useNavigate();
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [ripples, setRipples] = useState<{ id: string; x: number; y: number; color: string }[]>([]);
  const headerUpdate = useUpdateScope();
  const [headerName, setHeaderName] = useState("");
  const currentScope = useMemo(
    () => scopes.find((s) => s.id === currentScopeId) ?? null,
    [scopes, currentScopeId],
  );
  useEffect(() => {
    setHeaderName(currentScope?.name ?? "");
  }, [currentScope?.id, currentScope?.name]);
  async function commitHeaderName() {
    if (!currentScope) return;
    const trimmed = headerName.trim();
    if (!trimmed || trimmed === currentScope.name) return;
    await headerUpdate.mutateAsync({ id: currentScope.id, payload: { name: trimmed } });
  }

  // user 全 review を 1 度だけ取得して、client-side で scope.filter ごとに絞り込む
  // (review route の scope_id は status_stabilities override 専用で member filter
  //  には使われないため、ここで filter する)
  const { data: allReviews = [] } = useReviewList(undefined);

  const statsByScope = useMemo(() => {
    const m = new Map<string, ScopeStats>();
    for (const s of scopes) {
      const filter = (s.filter ?? {}) as { fieldIds?: string[]; subjectIds?: string[]; levelIds?: string[] };
      const filtered = filterRowsByScope(allReviews as ReviewRow[], filter);
      m.set(s.id, computeStats(filtered));
    }
    return m;
  }, [scopes, allReviews]);

  const total = scopes.length + 1;
  const cols = Math.min(COLS_MAX, Math.max(1, total));

  const [editingScopeId, setEditingScopeId] = useState<string | null>(null);

  function spawnRipple(svgEl: SVGSVGElement | null, clientX: number, clientY: number, color: string) {
    if (!svgEl) return;
    const pt = svgEl.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svgEl.getScreenCTM();
    if (!ctm) return;
    const local = pt.matrixTransform(ctm.inverse());
    const id = `${Date.now()}-${Math.random()}`;
    setRipples((rs) => [...rs, { id, x: local.x, y: local.y, color }]);
    setTimeout(() => {
      setRipples((rs) => rs.filter((r) => r.id !== id));
    }, 500);
  }

  const lastCenter = bigCenterAt(total - 1, cols);
  const requiredHeight = lastCenter.cy + MENU_OUTER_R + 60;

  function onSectorClick(scopeId: string, view: SectorDef["view"]) {
    setCurrentScopeId(scopeId);
    if (view === "edit") {
      setEditingScopeId(scopeId);
    } else {
      navigate({ to: `/${view}` as string, search: { scope_id: scopeId } });
    }
  }

  const newCenter = bigCenterAt(scopes.length, cols);
  const editingScope = scopes.find((s) => s.id === editingScopeId) ?? null;

  return (
    <>
    {currentScope && renderHeaderSlot(
      <Input
        value={headerName}
        onChange={(e) => setHeaderName(e.target.value)}
        onBlur={commitHeaderName}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
          if (e.key === "Escape") {
            setHeaderName(currentScope.name);
            (e.currentTarget as HTMLInputElement).blur();
          }
        }}
        className="h-7 text-xs max-w-xs"
      />
    )}
    <div
      className="relative w-full"
      style={{ minHeight: `${Math.max(requiredHeight, 600)}px` }}
    >
      <svg
        className="absolute inset-0 w-full h-full text-muted-foreground"
        style={{ display: "block" }}
      >
        <style>{`
          @keyframes scope-pulse {
            0%, 100% { opacity: 0.55; }
            50% { opacity: 1; }
          }
          @keyframes scope-pop {
            from { opacity: 0; transform: scale(0.85); }
            to { opacity: 1; transform: scale(1); }
          }
          @keyframes badge-pulse {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.18); }
          }
          @keyframes ripple {
            from { r: 4; opacity: 0.5; }
            to { r: 60; opacity: 0; }
          }
          @keyframes ring-draw {
            from { stroke-dashoffset: 1000; }
            to { stroke-dashoffset: var(--ring-target, 0); }
          }
          .new-pulse { animation: scope-pulse 2.4s ease-in-out infinite; }
          .sector-pop {
            transform-box: fill-box;
            transform-origin: center;
            animation: scope-pop 180ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
          }
          .badge-pulse {
            transform-box: fill-box;
            transform-origin: center;
            animation: badge-pulse 1.6s ease-in-out infinite;
          }
          .ripple-circle {
            animation: ripple 500ms ease-out forwards;
            pointer-events: none;
          }
        `}</style>
        <defs>
          {/*
            Pattern tile [0, CELL_W] × [0, 2*CELL_H]。SVG <pattern> はタイル外を
            clip するので、honeycomb の継ぎ目を埋めるため tile の 4 角と中心の計 5 個
            の hex polygon を描く (角の hex は隣接タイルとちょうど補完しあう)。
          */}
          <pattern
            id="hexGrid"
            width={CELL_W}
            height={2 * CELL_H}
            patternUnits="userSpaceOnUse"
          >
            {[
              [0, 0],
              [CELL_W, 0],
              [0, 2 * CELL_H],
              [CELL_W, 2 * CELL_H],
              [CELL_W / 2, CELL_H],
            ].map(([px, py], i) => (
              <polygon
                key={i}
                points={hexPoints(px, py, SMALL_SIDE - 1.6)}
                fill="none"
                stroke="currentColor"
                strokeOpacity={0.32}
                strokeWidth={1.4}
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </pattern>
        </defs>
        <rect x="0" y="0" width="100%" height="100%" fill="url(#hexGrid)" />

        {/* 各 scope */}
        {scopes.map((scope, idx) => {
          const { cx, cy } = bigCenterAt(idx, cols);
          const hovered = hoveredId === scope.id;
          const stats = statsByScope.get(scope.id) ?? { total: 0, active: 0, overdue: 0, dueToday: 0, pending: 0, goodPct: 0, nextDue: null };
          const heat = heatColor(stats);
          // 進捗リング: scope hex の外周「六角形の辺」に沿って描画
          const RING_SIDE = SIDE + 6;
          const RING_PERIMETER = 6 * RING_SIDE;
          // subtitle: scope filter にマッチする members 総数
          const subtitle = stats.total > 0 ? `${stats.total}件` : "";
          return (
            <g
              key={scope.id}
              onMouseEnter={() => setHoveredId(scope.id)}
              onMouseLeave={() => setHoveredId(null)}
              style={{
                transform: hovered ? "scale(1.06)" : "scale(1)",
                transformOrigin: `${cx}px ${cy}px`,
                transformBox: "fill-box" as React.CSSProperties["transformBox"],
                transition: "transform 220ms cubic-bezier(0.34, 1.56, 0.64, 1), filter 220ms ease-out",
                filter: hovered
                  ? "drop-shadow(0 0 18px rgba(249,115,22,0.65))"
                  : "drop-shadow(0 0 6px rgba(249,115,22,0.35))",
              }}
            >
              <circle
                cx={cx}
                cy={cy}
                r={MENU_OUTER_R + 4}
                fill="transparent"
                pointerEvents="all"
              />
              {/* 進捗バー track (hex の辺に沿う) */}
              <polygon
                points={hexPoints(cx, cy, RING_SIDE)}
                fill="none"
                stroke="currentColor"
                strokeOpacity={0.16}
                strokeWidth={3}
                strokeLinejoin="round"
              />
              {/* 進捗バー fill: top vertex から時計回りに goodPct% 分 */}
              {stats.active > 0 && stats.goodPct > 0 && (
                <polygon
                  points={hexPoints(cx, cy, RING_SIDE)}
                  fill="none"
                  stroke={heat.ring}
                  strokeWidth={3}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  strokeDasharray={RING_PERIMETER}
                  strokeDashoffset={RING_PERIMETER * (1 - stats.goodPct / 100)}
                />
              )}
              <polygon
                points={hexPoints(cx, cy, SIDE)}
                className={
                  hovered
                    ? "fill-accent stroke-primary transition-colors"
                    : "fill-card stroke-border transition-colors"
                }
                strokeWidth={1.8}
                strokeLinejoin="round"
              />
              <text
                x={cx}
                y={cy - 6}
                textAnchor="middle"
                dominantBaseline="central"
                className="fill-foreground text-[11px] font-semibold pointer-events-none select-none"
              >
                {truncate(scope.name, 7)}
              </text>
              {subtitle && (
                <text
                  x={cx}
                  y={cy + 10}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={9}
                  fontWeight={600}
                  className="fill-muted-foreground pointer-events-none select-none"
                >
                  {subtitle}
                </text>
              )}
              {hovered && (
                <g>
                  {SECTORS.map((sec) => {
                    const path = annularSector(
                      cx,
                      cy,
                      MENU_INNER_R,
                      MENU_OUTER_R,
                      sec.startDeg,
                      sec.endDeg,
                    );
                    const midDeg = (sec.startDeg + sec.endDeg) / 2;
                    const midRad = (midDeg * Math.PI) / 180;
                    const midR = (MENU_INNER_R + MENU_OUTER_R) / 2;
                    const lx = cx + midR * Math.cos(midRad);
                    const ly = cy + midR * Math.sin(midRad);
                    return (
                      <g
                        key={sec.label}
                        className="cursor-pointer sector-pop"
                        onClick={(e) => {
                          spawnRipple(
                            (e.currentTarget as SVGGElement).ownerSVGElement,
                            e.clientX,
                            e.clientY,
                            sec.color,
                          );
                          onSectorClick(scope.id, sec.view);
                        }}
                      >
                        <path
                          d={path}
                          fill="var(--card)"
                          stroke={sec.color}
                          strokeWidth={1.8}
                          strokeLinejoin="round"
                          style={{ transition: "fill 140ms" }}
                          onMouseEnter={(e) => {
                            (e.currentTarget as SVGPathElement).style.fill = sec.color;
                          }}
                          onMouseLeave={(e) => {
                            (e.currentTarget as SVGPathElement).style.fill = "var(--card)";
                          }}
                        />
                        <text
                          x={lx}
                          y={ly}
                          textAnchor="middle"
                          dominantBaseline="central"
                          fontSize={10}
                          fontWeight={700}
                          fill={sec.color}
                          className="pointer-events-none select-none"
                          style={{ paintOrder: "stroke" }}
                          stroke="var(--background)"
                          strokeWidth={0.4}
                        >
                          {sec.label}
                        </text>
                      </g>
                    );
                  })}
                </g>
              )}
            </g>
          );
        })}

        {/* New scope affordance */}
        <g
          style={{ cursor: "pointer" }}
          onClick={() => navigate({ to: "/scopes/new" as string })}
        >
          <polygon
            points={hexPoints(newCenter.cx, newCenter.cy, SIDE)}
            className="fill-card stroke-muted-foreground/60 hover:fill-accent hover:stroke-primary transition-colors new-pulse"
            strokeWidth={1.5}
            strokeDasharray="4 3"
            strokeLinejoin="round"
          />
          <path
            d={`M ${newCenter.cx - 10},${newCenter.cy} L ${newCenter.cx + 10},${newCenter.cy} M ${newCenter.cx},${newCenter.cy - 10} L ${newCenter.cx},${newCenter.cy + 10}`}
            stroke="currentColor"
            strokeWidth={2.4}
            strokeLinecap="round"
            className="text-muted-foreground pointer-events-none"
            fill="none"
          />
        </g>

        {/* Click ripples (overlays) */}
        {ripples.map((r) => (
          <circle
            key={r.id}
            cx={r.x}
            cy={r.y}
            r={4}
            fill="none"
            stroke={r.color}
            strokeWidth={2.5}
            className="ripple-circle"
          />
        ))}
      </svg>
    </div>
    {editingScope && (
      <ScopeEditDialog
        scope={editingScope}
        onClose={() => setEditingScopeId(null)}
      />
    )}
    </>
  );
}

function ScopeEditDialog({ scope, onClose }: { scope: ScopeRow; onClose: () => void }) {
  const update = useUpdateScope();
  const { data: fields = [] } = useFields();
  const [name, setName] = useState(scope.name);
  const [filter, setFilter] = useState<MemberFilterInput>(
    (scope.filter as MemberFilterInput) ?? {},
  );

  // scope が切り替わったら local state を再同期
  useEffect(() => {
    setName(scope.name);
    setFilter((scope.filter as MemberFilterInput) ?? {});
  }, [scope.id, scope.name, scope.filter]);

  async function onSave() {
    await update.mutateAsync({
      id: scope.id,
      payload: { name: name.trim() || scope.name, filter },
    });
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Edit scope</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="scope-name">Name</Label>
            <Input
              id="scope-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label>Members</Label>
            {fields.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                Fields がまだ作られていません
              </div>
            ) : (
              <MemberFilterPicker value={filter} onChange={setFilter} />
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onSave} disabled={update.isPending}>
            {update.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
