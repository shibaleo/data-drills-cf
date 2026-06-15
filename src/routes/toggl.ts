/**
 * Toggl time entries (Neon DWH 透過 read-only proxy)。
 *
 * 解釈 (study / 勉強カテゴリの選別等) は client 側に寄せて、サーバはほぼ生で返す。
 * cf 本番では Hyperdrive を経由しないので Neon pooler endpoint に直接接続している
 * ([@/lib/neon-db])。並列度は低め (max=2) で抑制。
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { neonSql } from "@/lib/neon-db";
import type { AuthResult } from "@/lib/auth";

type Env = { Variables: { authResult: AuthResult } };

export const togglTimeEntriesQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "from must be YYYY-MM-DD (JST)"),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "to must be YYYY-MM-DD (JST)"),
  category: z.string().optional(),
});

type Row = {
  id: string;
  source_id: string | null;
  started_at: Date;
  stopped_at: Date | null;
  duration_seconds: string | number | null;  // bigint may come as string
  description: string | null;
  project_id: string | number | null;
  project_name: string | null;
  project_color: string | null;
  client_name: string | null;
  tag_names: string[] | null;
  personal_category: string | null;
  coarse_personal_category: string | null;
  social_category: string | null;
};

type CategoryRow = {
  name: string;
  name_ja: string | null;
  description: string | null;
  coarse_category: string | null;
  sort_order: number | null;
};

type HabitCandidateRow = {
  project_name: string | null;
  description: string | null;
  project_color: string | null;
  n: string | number;        // bigint may come as string
  last_seen: Date | null;
};

const app = new Hono<Env>()
  /**
   * GET /categories — Toggl personal_category 一覧 (dim_category_time_personal)。
   * digest の生活軸 tab を DWH 駆動で動的描画するための master endpoint。
   * Education/Sleep/Exercise/... を sort_order 昇順で返す。
   */
  /**
   * GET /habit-candidates — habit 登録時に Toggl の (project_name, description)
   * 候補を warehouse から取得する master endpoint。
   * 過去 90 日のヒット数 (n) と最終出現日 (last_seen) で並べる。
   */
  .get("/habit-candidates", async (c) => {
    const rows = await neonSql<HabitCandidateRow[]>`
      SELECT
        project_name,
        description,
        MIN(project_color) AS project_color,
        COUNT(*) AS n,
        MAX(started_at) AS last_seen
      FROM data_presentation.fct_toggl_time_entries
      WHERE started_at >= NOW() - INTERVAL '90 days'
        AND project_name IS NOT NULL
        AND description IS NOT NULL
        AND description <> ''
      GROUP BY project_name, description
      ORDER BY project_name ASC, n DESC
    `;
    return c.json({
      data: rows.map((r) => ({
        project_name: r.project_name,
        description: r.description,
        project_color: r.project_color,
        n: Number(r.n),
        last_seen: r.last_seen instanceof Date ? r.last_seen.toISOString() : null,
      })),
    });
  })
  .get("/categories", async (c) => {
    // dim は dbt の default schema (= profile target.schema = data_warehouse) に materialize される
    const rows = await neonSql<CategoryRow[]>`
      SELECT name, name_ja, description, coarse_category, sort_order
      FROM data_warehouse.dim_category_time_personal
      ORDER BY sort_order ASC NULLS LAST, name ASC
    `;
    return c.json({
      data: rows.map((r) => ({
        name: r.name,
        name_ja: r.name_ja,
        description: r.description,
        coarse_category: r.coarse_category,
        sort_order: r.sort_order == null ? null : Number(r.sort_order),
      })),
    });
  })
  /**
   * GET /time-entries?from=YYYY-MM-DD&to=YYYY-MM-DD[&category=...]
   *
   * JST 日付範囲で entry を絞る (started_at の JST 日付ベース)。
   * 期間は inclusive。
   */
  .get("/time-entries", zValidator("query", togglTimeEntriesQuerySchema), async (c) => {
    const { from, to, category } = c.req.valid("query");
    // 期間 [from 00:00 JST, to+1 00:00 JST) と OVERLAP する entry を返す。
    // 前日深夜開始 → 当日午前終了の睡眠等、日跨ぎ entry も拾う。進行中 (stopped_at NULL) も対象。
    //
    // 注: `date AT TIME ZONE 'Asia/Tokyo'` は JST midnight にならない (Postgres が date を
    //     UTC midnight として promote するため)。明示的に ::timestamp キャストしてから
    //     AT TIME ZONE することで naive midnight を JST として解釈させる。
    const rows = category
      ? await neonSql<Row[]>`
          SELECT
            id, source_id, started_at, stopped_at, duration_seconds,
            description, project_id, project_name, project_color,
            client_name, tag_names, personal_category,
            coarse_personal_category, social_category
          FROM data_presentation.fct_toggl_time_entries
          WHERE started_at < (${to}::date + INTERVAL '1 day')::timestamp AT TIME ZONE 'Asia/Tokyo'
            AND (stopped_at IS NULL OR stopped_at > (${from}::date)::timestamp AT TIME ZONE 'Asia/Tokyo')
            AND personal_category = ${category}
          ORDER BY started_at ASC
        `
      : await neonSql<Row[]>`
          SELECT
            id, source_id, started_at, stopped_at, duration_seconds,
            description, project_id, project_name, project_color,
            client_name, tag_names, personal_category,
            coarse_personal_category, social_category
          FROM data_presentation.fct_toggl_time_entries
          WHERE started_at < (${to}::date + INTERVAL '1 day')::timestamp AT TIME ZONE 'Asia/Tokyo'
            AND (stopped_at IS NULL OR stopped_at > (${from}::date)::timestamp AT TIME ZONE 'Asia/Tokyo')
          ORDER BY started_at ASC
        `;
    return c.json({
      data: rows.map((r) => ({
        id: r.id,
        source_id: r.source_id,
        started_at: r.started_at instanceof Date ? r.started_at.toISOString() : String(r.started_at),
        stopped_at: r.stopped_at instanceof Date ? r.stopped_at.toISOString() : (r.stopped_at ? String(r.stopped_at) : null),
        duration_seconds: r.duration_seconds == null ? null : Number(r.duration_seconds),
        description: r.description,
        project_id: r.project_id == null ? null : Number(r.project_id),
        project_name: r.project_name,
        project_color: r.project_color,
        client_name: r.client_name,
        tag_names: r.tag_names ?? [],
        personal_category: r.personal_category,
        coarse_personal_category: r.coarse_personal_category,
        social_category: r.social_category,
      })),
    });
  });

export default app;
