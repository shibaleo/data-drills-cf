"use client";
import { useMemo, useState, useEffect, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useScopes, useUpdateScope, type ScopeRow } from "@/hooks/queries/use-scopes";
import { useField } from "@/hooks/use-field";
import { useFields } from "@/hooks/queries/use-field-data";
import { usePageTitle } from "@/lib/page-context";
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
// 小六角: hex width = SQRT3*15 ≈ 25.98
const SMALL_SIDE = 15;
// SIDE = SMALL_SIDE * 6 (= 90): 全 6 頂点が小六角の top vertex に snap する整合値。
const SIDE = 90;
const CELL_W = SQRT3 * SMALL_SIDE;
const CELL_H = 1.5 * SMALL_SIDE;

// 放射状メニュー。hex から十分離し、ボタン (sector) も背高に
// hex 外周から sector までの間隔と sector の半径方向厚み。
// chunky 感を出すために hex 寄りにして ring 自体も太く。
const MENU_INNER_R = SIDE + 16;
const MENU_OUTER_R = MENU_INNER_R + 54;
// sector 間の角度 gap (= 扇形を独立した petal に見せる)
const SECTOR_GAP_DEG = 5;
// 個別 sector hover 時に外側へ伸びる量 (= 「段差」)
const SECTOR_HOVER_LIFT = 12;

// 大六角の top vertex を「小六角の top vertex」に snap (= 全 6 頂点が snap)
// 横 pitch ≈ COL_STEP_T*CELL_W = 13*25.98 = 337。縦は ROW_STEP_T*CELL_H = 16*22.5 = 360
// で横と概ね揃える (menu 外径 162 を 2 倍した 324 より大きく overlap も回避)
const ANCHOR_ROW_T = 8;
const COL_STEP_T = 13;
const ROW_STEP_T = 16; // 要 even
const COLS_MAX = 3;

/** viewport 幅から表示可能な最大 col 数を求める */
function maxColsFor(width: number): number {
  if (width < 640) return 1;
  if (width < 1024) return 2;
  return COLS_MAX;
}

/**
 * 大六角群を左右中央に配置するための anchorColT を計算。
 * group 全幅 = (cols - 1) * COL_STEP_T * CELL_W (= 中心間距離 × (cols-1))
 * 最初の hex の center x = (containerWidth - group全幅) / 2
 * anchorColT = round(firstCenterX / CELL_W) で整数 cell snap して grid 整合維持
 */
function computeAnchorColT(containerWidth: number, cols: number): number {
  if (containerWidth <= 0) return 9;
  const groupWidth = (cols - 1) * COL_STEP_T * CELL_W;
  const firstCenterX = (containerWidth - groupWidth) / 2;
  return Math.max(3, Math.round(firstCenterX / CELL_W));
}

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

/** vertex から prev/next vertex 方向に r 進んだ点を返す (= inset 端点)。 */
function insetAlong(
  vertex: [number, number],
  toward: [number, number],
  r: number,
): [number, number] {
  const dx = toward[0] - vertex[0];
  const dy = toward[1] - vertex[1];
  const len = Math.hypot(dx, dy);
  return [vertex[0] + (dx / len) * r, vertex[1] + (dy / len) * r];
}

/**
 * Hexagon with rounded corners. annularSector と同じ qCorner pattern
 * (Q-Bezier control を元頂点に) で構築するので、両者ロジックは同型。
 */
function hexPath(cx: number, cy: number, side: number, radius: number): string {
  const verts: [number, number][] = [
    [cx, cy - side],
    [cx + (SQRT3 * side) / 2, cy - side / 2],
    [cx + (SQRT3 * side) / 2, cy + side / 2],
    [cx, cy + side],
    [cx - (SQRT3 * side) / 2, cy + side / 2],
    [cx - (SQRT3 * side) / 2, cy - side / 2],
  ];
  const r = Math.min(radius, side * 0.45);
  const parts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const cur = verts[i];
    const inPt = insetAlong(cur, verts[(i + 5) % 6], r);
    const outPt = insetAlong(cur, verts[(i + 1) % 6], r);
    parts.push(`${i === 0 ? "M" : "L"} ${inPt[0]} ${inPt[1]}`);
    parts.push(qCorner(cur, outPt));
  }
  parts.push("Z");
  return parts.join(" ");
}

function bigCenterAt(idx: number, cols: number, anchorColT: number): { cx: number; cy: number } {
  const col = idx % cols;
  const row = Math.floor(idx / cols);
  const col_T = anchorColT + col * COL_STEP_T;
  const row_T = ANCHOR_ROW_T + row * ROW_STEP_T;
  // top vertex 位置 (小六角 (col_T, row_T) の top vertex):
  //   x = col_T * CELL_W + (row_T % 2) * CELL_W/2
  //   y = row_T * CELL_H - SMALL_SIDE
  const tx = col_T * CELL_W + (row_T & 1) * (CELL_W / 2);
  const ty = row_T * CELL_H - SMALL_SIDE;
  return { cx: tx, cy: ty + SIDE };
}

/**
 * 角丸 corner の SVG segment。pattern は両 path 共通:
 *   incoming inset 点までは L or A → このコーナーで Q (control = 元の sharp
 *   vertex) → outgoing inset 点へ → 次の edge に続く。
 * Q-Bezier の control を元頂点に置く方式なので、edge が line でも arc でも
 * 必ず convex に外向きの丸みになる (concave 不可能)。
 */
function qCorner(
  vertex: [number, number],
  outPt: [number, number],
): string {
  return `Q ${vertex[0]} ${vertex[1]} ${outPt[0]} ${outPt[1]}`;
}

function annularSector(
  cx: number,
  cy: number,
  innerR: number,
  outerR: number,
  startDeg: number,
  endDeg: number,
  cornerRadius = 0,
): string {
  const a1 = (startDeg * Math.PI) / 180;
  const a2 = (endDeg * Math.PI) / 180;
  const ptOn = (R: number, ang: number): [number, number] => [
    cx + R * Math.cos(ang),
    cy + R * Math.sin(ang),
  ];
  if (cornerRadius <= 0) {
    const [x1o, y1o] = ptOn(outerR, a1);
    const [x2o, y2o] = ptOn(outerR, a2);
    const [x1i, y1i] = ptOn(innerR, a1);
    const [x2i, y2i] = ptOn(innerR, a2);
    return [
      `M ${x1o} ${y1o}`,
      `A ${outerR} ${outerR} 0 0 1 ${x2o} ${y2o}`,
      `L ${x2i} ${y2i}`,
      `A ${innerR} ${innerR} 0 0 0 ${x1i} ${y1i}`,
      "Z",
    ].join(" ");
  }
  const r = Math.min(cornerRadius, (outerR - innerR) / 2 - 0.5);
  // 各 corner の (元の sharp 頂点, 直前 edge 上の inset, 直後 edge 上の inset)。
  // 直線 edge 上の inset は radial 方向に r、arc edge 上の inset は arc-length
  // r 相当の角 (= r/R)。
  const v1 = ptOn(outerR, a1); // outer-start
  const v2 = ptOn(outerR, a2); // outer-end
  const v3 = ptOn(innerR, a2); // inner-end
  const v4 = ptOn(innerR, a1); // inner-start
  const v1in = ptOn(outerR - r, a1);                  // from radial (inner→outer 方向の手前)
  const v1out = ptOn(outerR, a1 + r / outerR);        // outer arc 前進
  const v2in = ptOn(outerR, a2 - r / outerR);
  const v2out = ptOn(outerR - r, a2);
  const v3in = ptOn(innerR + r, a2);
  const v3out = ptOn(innerR, a2 - r / innerR);        // inner arc は逆周りなので角を引く
  const v4in = ptOn(innerR, a1 + r / innerR);
  const v4out = ptOn(innerR + r, a1);
  return [
    `M ${v1in[0]} ${v1in[1]}`,
    qCorner(v1, v1out),
    `A ${outerR} ${outerR} 0 0 1 ${v2in[0]} ${v2in[1]}`,
    qCorner(v2, v2out),
    `L ${v3in[0]} ${v3in[1]}`,
    qCorner(v3, v3out),
    `A ${innerR} ${innerR} 0 0 0 ${v4in[0]} ${v4in[1]}`,
    qCorner(v4, v4out),
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

// カラースキームは block-color.ts のライフサイクル (Planned/First/Miss/Rough/Fluent/Done)
// に揃える。意味は別途検討としていったん視覚一致のみ。
// 配置: 長文字の Throughput は左下 (SW)、Stats は右 (E) に。
const SECTORS: SectorDef[] = [
  // テーマ primary (HSL 19 58% 56%) 方向にシフト (ΔH=-6 ΔS=-20 ΔL=0)。
  // 全 6 色を同距離でトーン調整: rainbow の元気は残しつつ vibrancy を半分ほど
  // 抑えて theme と協和。やる気が出る (saturated) と落ち着き (controlled) の
  // 中間。Plan は theme より少し saturated を残してアクセント化。
  { startDeg: -150, endDeg: -90, label: "Edit", view: "edit", color: "#d75ba5" },          // rich rose (Planned)
  { startDeg: -90, endDeg: -30, label: "Review", view: "review", color: "#846ce5" },        // rich lavender (First)
  { startDeg: -30, endDeg: 30, label: "Stats", view: "stats", color: "#da5865" },           // vibrant coral (Miss)
  { startDeg: 30, endDeg: 90, label: "Plan", view: "plan", color: "#e1662d" },              // vivid terracotta (Rough)
  { startDeg: 90, endDeg: 150, label: "Throughput", view: "throughput", color: "#38ad58" }, // forest green (Fluent)
  { startDeg: 150, endDeg: 210, label: "Digest", view: "digest", color: "#5197e1" },        // denim blue (Done)
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
  const fieldSet = filter.fieldIds !== undefined ? new Set(filter.fieldIds) : null;
  const subjectSet = filter.subjectIds !== undefined ? new Set(filter.subjectIds) : null;
  const levelSet = filter.levelIds !== undefined ? new Set(filter.levelIds) : null;
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

// すべて semantic な --primary (= theme primary) 参照。色値はハードコードしない。
const THEME_PRIMARY = "hsl(var(--primary))";
const THEME_PRIMARY_GLOW_SOFT = "hsl(var(--primary) / 0.35)";

function heatColor(): { glow: string; ring: string } {
  return { glow: THEME_PRIMARY_GLOW_SOFT, ring: THEME_PRIMARY };
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
  const { setCurrentScopeId } = useField();
  const { data: scopes = [] } = useScopes();
  const navigate = useNavigate();
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [hoveredSec, setHoveredSec] = useState<string | null>(null);
  const [ripples, setRipples] = useState<{ id: string; x: number; y: number; color: string }[]>([]);

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
  // viewport 幅で cols / 中央配置 anchorColT を動的計算。
  // window.innerWidth を一次参照、container 幅は SVG コンテンツで広がりやすいので
  // 念のため Math.min で頭打ち。
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewWidth, setViewWidth] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth : 1200,
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = () => {
      const innerW = window.innerWidth;
      const containerW = containerRef.current?.clientWidth ?? innerW;
      setViewWidth(Math.min(innerW, containerW));
    };
    handler();
    window.addEventListener("resize", handler);
    const obs = containerRef.current
      ? new ResizeObserver(() => handler())
      : null;
    if (containerRef.current && obs) obs.observe(containerRef.current);
    return () => {
      window.removeEventListener("resize", handler);
      obs?.disconnect();
    };
  }, []);
  const maxCols = maxColsFor(viewWidth);
  const cols = Math.min(maxCols, Math.max(1, total));
  const anchorColT = useMemo(
    () => computeAnchorColT(viewWidth, cols),
    [viewWidth, cols],
  );

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

  const lastCenter = bigCenterAt(total - 1, cols, anchorColT);
  const requiredHeight = lastCenter.cy + MENU_OUTER_R + 60;

  function onSectorClick(scopeId: string, view: SectorDef["view"]) {
    setCurrentScopeId(scopeId);
    if (view === "edit") {
      setEditingScopeId(scopeId);
    } else if (view === "review" || view === "throughput" || view === "stats" || view === "digest") {
      // Plan A: 4 view すべて canonical scope.id 直行
      navigate({ to: `/${view}/$scope_id` as string, params: { scope_id: scopeId } });
    } else {
      navigate({ to: `/${view}` as string, search: { scope_id: scopeId } });
    }
  }

  const newCenter = bigCenterAt(scopes.length, cols, anchorColT);
  const editingScope = scopes.find((s) => s.id === editingScopeId) ?? null;

  return (
    <>
    <div
      ref={containerRef}
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
              <path
                key={i}
                d={hexPath(px, py, SMALL_SIDE - 1.6, 1.6)}
                fill="none"
                stroke="currentColor"
                strokeOpacity={0.32}
                strokeWidth={1.4}
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </pattern>
          {/* hex の fill 用 gradient — idle=gray, hover=黒系, sector hover=warm orange */}
          <radialGradient id="hexFillIdle" cx="50%" cy="30%" r="80%">
            <stop offset="0%" stopColor="hsl(0 0% 30%)" stopOpacity="1" />
            <stop offset="100%" stopColor="hsl(0 0% 20%)" stopOpacity="1" />
          </radialGradient>
          <radialGradient id="hexFillHover" cx="50%" cy="30%" r="80%">
            <stop offset="0%" stopColor="hsl(var(--card))" stopOpacity="1" />
            <stop offset="100%" stopColor="hsl(240 6% 11%)" stopOpacity="1" />
          </radialGradient>
          <radialGradient id="hexFillWarm" cx="50%" cy="30%" r="85%">
            <stop offset="0%" stopColor="hsl(var(--primary) / 0.35)" stopOpacity="1" />
            <stop offset="60%" stopColor="hsl(var(--primary) / 0.15)" stopOpacity="1" />
            <stop offset="100%" stopColor="hsl(0 0% 6%)" stopOpacity="1" />
          </radialGradient>
        </defs>
        <rect x="0" y="0" width="100%" height="100%" fill="url(#hexGrid)" />

        {/* 全体スモーク overlay: いずれかの scope を hover 中は背景と他 scope を暗く */}
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="black"
          style={{
            pointerEvents: "none",
            opacity: hoveredId !== null ? 0.55 : 0,
            transition: "opacity 200ms ease-out",
          }}
        />

        {/* 各 scope */}
        {scopes.map((scope, idx) => {
          const { cx, cy } = bigCenterAt(idx, cols, anchorColT);
          const hovered = hoveredId === scope.id;
          const stats = statsByScope.get(scope.id) ?? { total: 0, active: 0, overdue: 0, dueToday: 0, pending: 0, goodPct: 0, nextDue: null };
          const heat = heatColor();
          // 進捗リング: scope hex の外周「六角形の辺」に沿って描画
          const RING_SIDE = SIDE + 6;
          const RING_PERIMETER = 6 * RING_SIDE;
          // 多行 name (= 9 字超は 2 行に折返し、合計 18 字超は ellipsis)。
          // 「(」「(」の直前で折返しを優先 (= 括弧の中途切れを避ける)。
          const NAME_LINE = 9;
          const nameLines: string[] = (() => {
            const n = scope.name;
            if (n.length <= NAME_LINE) return [n];
            // 自然な break point を探す: 半角/全角 ( の直前 (中間付近にあれば優先)
            const paren = Math.max(n.lastIndexOf("("), n.lastIndexOf("("));
            const goodParen = paren > 1 && paren <= NAME_LINE * 2;
            const split = goodParen ? paren : Math.ceil(n.length / 2);
            const line1 = n.slice(0, split).trimEnd();
            const rest = n.slice(split);
            if (rest.length <= NAME_LINE) return [line1, rest];
            return [line1, rest.slice(0, NAME_LINE - 1) + "…"];
          })();
          // subtitle 1: 全体件数 + 未消化バッジ風
          const countLine = stats.total > 0 ? `${stats.total}件` : "";
          const pendingLine =
            stats.pending > 0
              ? `${stats.pending} due`
              : stats.active > 0
                ? "✓ caught up"
                : "";
          const nextLine =
            stats.pending === 0 && stats.nextDue !== null && stats.active > 0
              ? `next ${stats.nextDue}d`
              : "";
          return (
            <g
              key={scope.id}
              onMouseEnter={() => setHoveredId(scope.id)}
              onMouseLeave={() => setHoveredId(null)}
              style={{
                transform: hovered
                  ? `translate(${cx}px, ${cy}px) scale(1.06) translate(${-cx}px, ${-cy}px)`
                  : "none",
                // 他 scope が hover 中ならこの scope はスモーク
                opacity: hoveredId !== null && !hovered ? 0.18 : 1,
                transition:
                  "transform 220ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity 200ms ease-out",
              }}
            >
              <circle
                cx={cx}
                cy={cy}
                r={MENU_OUTER_R + 4}
                fill="transparent"
                pointerEvents="all"
              />
              {/* hex 本体 + progress ring + label を内側 group に分離し、
                  glow filter はここだけに当てる (sector menu には掛けない) */}
              <g
                style={{
                  // 控えめな drop-shadow で halo を残す (sector を主役にするため
                  // 旧 0.85 / 0.65 / 0.45 から大幅に落とす)
                  filter: hovered
                    ? `drop-shadow(0 0 6px hsl(var(--primary) / 0.45)) drop-shadow(0 0 20px hsl(var(--primary) / 0.22)) drop-shadow(0 0 40px hsl(var(--primary) / 0.12))`
                    : "none",
                  transition: "filter 220ms ease-out",
                }}
              >
                {/* 進捗バー (hex の辺に沿って goodPct% 分だけ描画)。
                    背景の "track" は描かず、伸びている部分だけ常時表示。
                    hover 中は menu や glow と被るので非表示 */}
                {!hovered && stats.active > 0 && stats.goodPct > 0 && (
                  <path
                    d={hexPath(cx, cy, RING_SIDE, 8)}
                    fill="none"
                    stroke={heat.ring}
                    strokeWidth={3}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    strokeDasharray={RING_PERIMETER}
                    strokeDashoffset={RING_PERIMETER * (1 - stats.goodPct / 100)}
                  />
                )}
                <path
                  d={hexPath(cx, cy, SIDE, 7)}
                  fill={hovered ? "url(#hexFillHover)" : "url(#hexFillIdle)"}
                  stroke={
                    hovered || stats.pending > 0
                      ? "hsl(var(--primary) / 0.55)"
                      : "hsl(var(--border))"
                  }
                  strokeWidth={1.8}
                  strokeLinejoin="round"
                  style={{ transition: "fill 200ms ease-out, stroke 200ms ease-out" }}
                />
                {/* タイトル: 1 行 or 2 行折返し。font サイズは行数で調整 */}
                {nameLines.map((line, i) => {
                  const isTwoLines = nameLines.length > 1;
                  const fontPx = isTwoLines ? 14 : 16;
                  // 2 行のときは中心からの y 配置
                  const baseY = isTwoLines ? cy - 22 + i * (fontPx + 2) : cy - 18;
                  return (
                    <text
                      key={i}
                      x={cx}
                      y={baseY}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize={fontPx}
                      fontWeight={600}
                      className="fill-foreground pointer-events-none select-none"
                    >
                      {line}
                    </text>
                  );
                })}
                {/* 件数: メイン情報として強調 */}
                {countLine && (
                  <text
                    x={cx}
                    y={cy + 12}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={18}
                    fontWeight={800}
                    className="fill-foreground pointer-events-none select-none"
                    style={{ fontVariantNumeric: "tabular-nums" }}
                  >
                    {countLine}
                  </text>
                )}
                {/* 未消化 / 状態: pill は status 専用なので、ここでは
                    左に色付き dot + 件数テキストで表現 (status pill とは形が違う) */}
                {stats.pending > 0 ? (
                  <g>
                    <circle
                      cx={cx - 22}
                      cy={cy + 32}
                      r={3.5}
                      fill="hsl(var(--primary))"
                    />
                    <text
                      x={cx - 14}
                      y={cy + 32}
                      textAnchor="start"
                      dominantBaseline="central"
                      fontSize={11}
                      fontWeight={700}
                      fill="hsl(var(--primary))"
                      className="pointer-events-none select-none"
                      style={{ fontVariantNumeric: "tabular-nums" }}
                    >
                      {stats.pending} due
                    </text>
                  </g>
                ) : pendingLine ? (
                  <text
                    x={cx}
                    y={cy + 32}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={10}
                    fontWeight={600}
                    className="fill-muted-foreground/80 pointer-events-none select-none"
                  >
                    {pendingLine}
                  </text>
                ) : null}
                {nextLine && (
                  <text
                    x={cx}
                    y={cy + 46}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={9}
                    className="fill-muted-foreground/60 pointer-events-none select-none"
                    style={{ fontVariantNumeric: "tabular-nums" }}
                  >
                    {nextLine}
                  </text>
                )}
              </g>
              {hovered && (
                <g>
                  {SECTORS.map((sec) => {
                    // 各 sector の両端から GAP/2 ずつ引いて隙間を作る
                    const adjStart = sec.startDeg + SECTOR_GAP_DEG / 2;
                    const adjEnd = sec.endDeg - SECTOR_GAP_DEG / 2;
                    const secKey = `${scope.id}:${sec.label}`;
                    const isSecHover = hoveredSec === secKey;
                    const outerR = MENU_OUTER_R + (isSecHover ? SECTOR_HOVER_LIFT : 0);
                    const path = annularSector(
                      cx,
                      cy,
                      MENU_INNER_R,
                      outerR,
                      adjStart,
                      adjEnd,
                      5,
                    );
                    // 全 sector で中心 arc に統一 (innerR と outerR の中点)。
                    // 上半円 (Edit/Review/Stats/Digest) は時計回り baseline (sweep=1)、
                    // 下半円 (Plan/Throughput) は反時計回り (sweep=0) でテキスト上向き。
                    const textArcR = (MENU_INNER_R + outerR) / 2;
                    const midDeg = (adjStart + adjEnd) / 2;
                    const isBottomHalf = midDeg > 0 && midDeg < 180;
                    const aStart = (adjStart * Math.PI) / 180;
                    const aEnd = (adjEnd * Math.PI) / 180;
                    const p1x = cx + textArcR * Math.cos(aStart);
                    const p1y = cy + textArcR * Math.sin(aStart);
                    const p2x = cx + textArcR * Math.cos(aEnd);
                    const p2y = cy + textArcR * Math.sin(aEnd);
                    const textArcPath = isBottomHalf
                      ? `M ${p2x} ${p2y} A ${textArcR} ${textArcR} 0 0 0 ${p1x} ${p1y}`
                      : `M ${p1x} ${p1y} A ${textArcR} ${textArcR} 0 0 1 ${p2x} ${p2y}`;
                    const arcId = `arc-${scope.id}-${sec.label}`;
                    // 他 sector が hover 中ならこの sector はスモーク (dim)
                    const anySecHovered = hoveredSec !== null;
                    const dim = anySecHovered && !isSecHover;
                    return (
                      <g
                        key={sec.label}
                        className="cursor-pointer sector-pop"
                        onMouseEnter={() => setHoveredSec(secKey)}
                        onMouseLeave={() => setHoveredSec(null)}
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
                        {/* 内側 group で dim 制御。sector-pop animation の opacity:1
                            上書きを避けるため別 group に分離 */}
                        <g
                          style={{
                            opacity: dim ? 0.22 : 1,
                            transition: "opacity 160ms ease-out",
                          }}
                        >
                          <path
                            d={path}
                            // 中心 hex hover (menu 出現) 時: 色塗り + 同色細枠
                            // 個別 sector hover 時: 黒背景に切替 + 枠は消す + glow
                            // (border 色は外して文字色で色付け)
                            fill={isSecHover ? "var(--background)" : sec.color}
                            stroke={isSecHover ? "transparent" : sec.color}
                            strokeWidth={1.8}
                            strokeLinejoin="round"
                            style={{
                              transition: "fill 160ms, stroke 160ms, d 180ms cubic-bezier(0.34, 1.56, 0.64, 1), filter 180ms ease-out",
                              filter: isSecHover
                                ? `drop-shadow(0 0 10px ${sec.color}) drop-shadow(0 0 24px ${sec.color}) drop-shadow(0 0 48px ${sec.color})`
                                : "none",
                            }}
                          />
                          {/* hidden path for textPath */}
                          <path id={arcId} d={textArcPath} fill="none" stroke="none" />
                          <text
                            fontSize={16}
                            fontWeight={900}
                            fill={isSecHover ? sec.color : "white"}
                            letterSpacing={0.6}
                            dominantBaseline="central"
                            style={{ transition: "fill 160ms ease-out" }}
                            className="pointer-events-none select-none"
                          >
                            <textPath
                              href={`#${arcId}`}
                              startOffset="50%"
                              textAnchor="middle"
                            >
                              {sec.label}
                            </textPath>
                          </text>
                        </g>
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
          style={{
            cursor: "pointer",
            opacity: hoveredId !== null ? 0.18 : 1,
            transition: "opacity 200ms ease-out",
          }}
          onClick={() => navigate({ to: "/scopes/new" as string })}
        >
          <path
            d={hexPath(newCenter.cx, newCenter.cy, SIDE, 11)}
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
