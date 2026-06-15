/**
 * habit feature の mock データ + OverlayBlock 変換。
 *
 * 本実装の意図:
 *   - /habits ページの UI shell を mock で先に動かして UX を確定する
 *   - schema / API / Worker on-demand sync が決まったら、この mock を
 *     useQuery 経由の real data 取得に置き換える
 *   - UI 側 (HabitsPage / TetrisChart) は data の出所を知らず、
 *     `HabitOverlayInput[]` → `OverlayBlock[]` の adapter だけ参照する
 */

import type { OverlayBlock } from "@/components/tetris";

export type HabitCadence = "daily" | "weekly";

export type HabitDef = {
  id: string;
  name: string;
  cadence: HabitCadence;
  /** OverlayBlock.color にそのまま流す (Tailwind 色を hex 化) */
  categoryColor: string;
  /** Toggl 上の (project_name, description) 完全一致タプル */
  togglProject: string;
  togglDescription: string;
  minutesEstimate: number;
  active: boolean;
};

/**
 * tetris 上での habit cell の意味分類。既存 Plan の overlay 規約に揃える:
 *   - throughput: 過去実績 (done された past day)。opacity 0.5 で薄く沈める
 *   - next-step:  今日の未消化 slot (= 今やるべき habit)。default opacity (0.85)
 *   - forecast:   未来の予定 slot。default opacity (0.85)
 *
 * 「今日の done 済」は throughput 扱い (= past 実績と同じ semantics)。
 */
export type HabitCellKind = "throughput" | "next-step" | "forecast";

export type HabitDoneCell = {
  habitId: string;
  date: string;            // YYYY-MM-DD
  kind: HabitCellKind;
};

/* ── Mock catalog ──────────────────────────────────────────────── */

export const MOCK_HABITS: HabitDef[] = [
  {
    id: "h_brush",
    name: "Brush teeth",
    cadence: "daily",
    categoryColor: "#06b6d4",  // cyan-500 (Hygiene)
    togglProject: "Hygiene",
    togglDescription: "brush teeth",
    minutesEstimate: 5,
    active: true,
  },
  {
    id: "h_wash_face",
    name: "Wash face",
    cadence: "daily",
    categoryColor: "#06b6d4",
    togglProject: "Hygiene",
    togglDescription: "wash the face",
    minutesEstimate: 3,
    active: true,
  },
  {
    id: "h_shower",
    name: "Shower",
    cadence: "daily",
    categoryColor: "#06b6d4",
    togglProject: "Hygiene",
    togglDescription: "shower",
    minutesEstimate: 15,
    active: true,
  },
  {
    id: "h_skincare",
    name: "Skincare",
    cadence: "daily",
    categoryColor: "#06b6d4",
    togglProject: "Hygiene",
    togglDescription: "skincare",
    minutesEstimate: 10,
    active: true,
  },
  {
    id: "h_laundry",
    name: "Laundry",
    cadence: "weekly",
    categoryColor: "#f59e0b",  // amber-500 (Chores)
    togglProject: "Chores",
    togglDescription: "laundry",
    minutesEstimate: 30,
    active: true,
  },
  {
    id: "h_cooking",
    name: "Cooking",
    cadence: "weekly",
    categoryColor: "#f59e0b",
    togglProject: "Chores",
    togglDescription: "cooking",
    minutesEstimate: 60,
    active: true,
  },
  {
    id: "h_dishes",
    name: "Wash dishes",
    cadence: "daily",
    categoryColor: "#f59e0b",
    togglProject: "Chores",
    togglDescription: "wash the dishes",
    minutesEstimate: 15,
    active: true,
  },
];

/* ── Date helpers (UTC ベース、tetris と揃える) ──────────────── */

function addDays(s: string, n: number): string {
  const d = new Date(`${s}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * 今日基準で過去 pastDays + 未来 futureDays のセルを生成する mock。
 * 実装時はここを「warehouse JOIN + Worker delta union」に差し替える。
 *
 * mock の振る舞い:
 *   - past: cadence に応じた確率で done を散布
 *   - today: planned (まだ done でない) を 1 つ生成
 *   - future: future-slot を cadence に応じて配置
 */
export function buildMockCells(
  habits: HabitDef[],
  today: string,
  pastDays = 30,
  futureDays = 7,
): HabitDoneCell[] {
  const cells: HabitDoneCell[] = [];
  for (const h of habits) {
    if (!h.active) continue;

    // past: done だけ throughput として表示 (missed は absence で表現)
    for (let i = pastDays; i >= 1; i--) {
      const date = addDays(today, -i);
      const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
      const hit = h.cadence === "daily"
        ? hashHit(`${h.id}:${date}`, 0.92)              // 92% 到達
        : (dow === (idHash(h.id) % 7));                 // 週 1 固定曜日
      if (hit) cells.push({ habitId: h.id, date, kind: "throughput" });
    }

    // today: 朝の "未消化" を next-step として表示
    // (real data では Toggl entry 有無で throughput / next-step を分ける)
    cells.push({ habitId: h.id, date: today, kind: "next-step" });

    // future: planned slot → forecast
    for (let i = 1; i <= futureDays; i++) {
      const date = addDays(today, i);
      const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
      const slot = h.cadence === "daily"
        ? true
        : (dow === (idHash(h.id) % 7));
      if (slot) cells.push({ habitId: h.id, date, kind: "forecast" });
    }
  }
  return cells;
}

function idHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function hashHit(seed: string, p: number): boolean {
  return (idHash(seed) % 100) / 100 < p;
}

/* ── HabitDoneCell → OverlayBlock 変換 ────────────────────────── */

export function toOverlayBlocks(
  cells: HabitDoneCell[],
  habitsById: Map<string, HabitDef>,
): OverlayBlock[] {
  const out: OverlayBlock[] = [];
  for (const c of cells) {
    const h = habitsById.get(c.habitId);
    if (!h) continue;
    out.push({
      problemId: `habit:${c.habitId}:${c.date}`,  // tetris の selectedId 衝突回避
      code: h.name,
      name: null,
      date: c.date,
      color: h.categoryColor,
      statusName: c.kind,
      // throughput のみ 0.5 で薄く沈める (Plan の答案 history overlay と同じ規約)。
      // next-step / forecast は未指定 → chart 既定の 0.85 が効く。
      opacity: c.kind === "throughput" ? 0.5 : undefined,
      kind: c.kind,
    });
  }
  return out;
}
