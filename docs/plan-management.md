# data-drills 目標管理ページ 実装計画

## Context

現状の data-drills は FSRS 復習スケジュール (`/schedule`) しか可視化していない。新規問題を **どのペースで消化していけば締切に間に合うか** を計画する仕組みが無く、500〜1000 問規模のバックログを扱う時に「いつ何問終わっているべきか」が見えない。

本機能は、**未解問題のバックログを daily quota で未来日に自動配分する Tetris** をプランごとに表示し、ユーザーが daily_minutes / milestone を調整しながら現実的な計画を作れるようにする。配分結果は DB に保存せず常にクライアント計算 (= 既存の FSRS 派生値と同じ哲学)。確定で残すのは **目標数値** (daily_minutes, milestones) のみで、これは bitemporal append-only 履歴として残す (= 「私はこの試験対策 plan の milestone を何度も後ろ倒した」という事実が見える)。

詳細議論は会話履歴に残るが、本ファイルに合意済み仕様を凝縮する。

---

## 1. 機能仕様

### 1.1 plan の定義

- ユーザーは複数 plan を同時に持てる (例: 簿記論 plan + 財表 plan)
- 各 plan は **filter spec** (subject / level / topic / tag) でメンバー問題集合を絞る
- メンバー = filter にマッチする問題、**answer 件数に依らない** (解いた問題も含む)
- 順序固定: `problem.code ASC, problem.id ASC` (deterministic、UI チラつき防止)

### 1.2 Tetris の意味

各 plan に 1 つの統合 Tetris:

- **過去側**: メンバーのうち初回 `answer` が記録済の問題を `answer.date` に配置 (1 問 = 1 ボックス)
- **未来側**: メンバーのうち未解の問題を `allocate()` 結果で割り当てて配置
- **今日**: 縦線で区切る
- **milestones**: 縦線で表示、左側のボックス数 (= 累積完了数) が `count` 以上なら達成
- **deadline オーバー**: 最終 milestone の日に「期日までに収まらない問題」を全部積み上げる (タワー状) — 非現実的な計画の可視化

### 1.3 allocate() アルゴリズム (純粋関数、クライアント)

```
入力: problems (未解、順序済), milestones [{ count, date }], dailyMinutes, today
出力: Map<ISO date, Problem[]>

milestones を date 昇順に並べ、各 segment 「problem_{c_{i-1}+1} .. problem_{c_i}」を独立処理:
  - segment 期間 = (前 milestone date +1) .. (この milestone date)
  - 期間日数 × dailyMinutes (秒換算) = 利用可能枠
  - segment 内 standard_time 合計が枠超過なら、超過分は milestone date 当日に全部積む
  - 収まる場合は順序通りに daily 枠を埋める greedy 配分
最終 milestone の後ろに残った問題は自由ペースで並べる (pile-up 無し)
```

### 1.4 plan 数値の編集

- スライダー UI ([既存 StabilitySlider](../../../../Users/m_fukuda/Documents/data-drills-cf/src/app/(pages)/schedule/page.tsx) を一般化) で daily_minutes / milestones をドラッグ調整
- スライダー動作中はクライアント再計算でプレビューのみ、DB 書き込み無し
- 「確定」ボタンで `PUT /api/v1/plans/:id` → 新 revision を INSERT、旧 revision の `valid_to` に NOW() を塗る (1 tx)

### 1.5 archive

`DELETE /api/v1/plans/:id` → `is_active=false` の新 revision を INSERT (物理削除しない、履歴保持)

---

## 2. データモデル

### 2.1 schema (`src/lib/db/schema.ts` に追記)

```ts
export const plan = pgTable("plan", {
  id: uuid("id").notNull(),
  revision: integer("revision").notNull(),
  projectId: uuid("project_id").notNull().references(() => project.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  dailyMinutes: integer("daily_minutes").notNull(),
  filter: jsonb("filter").$type<PlanFilter>().notNull().default({}),
  milestones: jsonb("milestones").$type<Milestone[]>().notNull().default([]),
  isActive: boolean("is_active").notNull().default(true),
  validFrom: timestamp("valid_from", { withTimezone: true }).notNull().defaultNow(),
  validTo: timestamp("valid_to", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.id, t.revision] }),
  index("plan_current_idx").on(t.id, t.revision.desc()),
]);

type PlanFilter = {
  subjectIds?: string[];
  levelIds?: string[];
  topicIds?: string[];
  tagIds?: string[];
};

type Milestone = { count: number; date: string };  // count = 累積問題数, date = "YYYY-MM-DD"
```

**`deadline` カラムは作らない**。最終 milestone (= 全問題数を含む milestone) が deadline 相当。最終 milestone が無ければ deadline 無し plan。

### 2.2 view (raw SQL migration)

```sql
CREATE VIEW view_current_plan AS
SELECT DISTINCT ON (id) *
FROM plan
WHERE valid_to IS NULL AND is_active = true
ORDER BY id, revision DESC;
```

**新規テーブルは `plan` のみ。`plan_problem` は作らない** (membership は filter から導出)。

### 2.3 既存スキーマへの影響

ゼロ。`problem` / `answer` / FSRS 関連は読むだけ、書き込み無し。

---

## 3. API (`src/routes/plans.ts` 新規)

Hono メソッドチェーン + zValidator + RPC 規約 ([CLAUDE.md](../../../../Users/m_fukuda/Documents/data-drills-cf/CLAUDE.md)) 準拠。

| Method | Path | 用途 |
|---|---|---|
| GET | `/api/v1/plans?project_id=` | 一覧 (view_current_plan) |
| POST | `/api/v1/plans` | 新規作成 (revision=1) |
| GET | `/api/v1/plans/:id` | 詳細 + メンバー問題 (filter ∩ project の問題を `standard_time`, 初回 `answer.date` 付きで返す) |
| PUT | `/api/v1/plans/:id` | 編集 = 新 revision INSERT + 旧 valid_to 塗り (1 tx) |
| DELETE | `/api/v1/plans/:id` | archive (is_active=false revision) |
| GET | `/api/v1/plans/:id/history` | 履歴 (MVP では未実装でも可、後追い) |

`src/lib/hono-app.ts` の `v1` ルーターに `.route("/plans", plansRoute)` で組み込む (auth middleware 配下、Clerk SSO で動く)。

### Zod (`src/lib/schemas/plan.ts` 新規)

```ts
export const planFilterSchema = z.object({
  subjectIds: z.array(z.string().uuid()).optional(),
  levelIds: z.array(z.string().uuid()).optional(),
  topicIds: z.array(z.string().uuid()).optional(),
  tagIds: z.array(z.string().uuid()).optional(),
});

export const milestoneSchema = z.object({
  count: z.number().int().positive(),
  date: z.string().date(),
});

export const planCreateInputSchema = z.object({
  project_id: z.string().uuid(),
  name: z.string().min(1),
  daily_minutes: z.number().int().positive(),
  filter: planFilterSchema.default({}),
  milestones: z.array(milestoneSchema).default([]),
});

export const planUpdateInputSchema = z.object({
  name: z.string().min(1).optional(),
  daily_minutes: z.number().int().positive().optional(),
  filter: planFilterSchema.optional(),
  milestones: z.array(milestoneSchema).optional(),
});
```

---

## 4. クライアント

### 4.1 ルート (`src/router.tsx` に追記)

```tsx
const plansRoute = lazyRoute("/plans", PlansPage);
const planNewRoute = lazyRoute("/plans/new", PlanNewPage);
const planDetailRoute = lazyRoute("/plans/$planId", PlanDetailPage);
// authLayout.addChildren([...]) に追加
```

### 4.2 ページ

| Path | ファイル | 役割 |
|---|---|---|
| `/plans` | `src/app/(pages)/plans/page.tsx` | 一覧。各 plan のカード (名前、メンバー数 / 完了数、最終 milestone, 過密度カラー) |
| `/plans/new` | `src/app/(pages)/plans/new/page.tsx` | filter 選択 + プレビュー + 作成 |
| `/plans/$planId` | `src/app/(pages)/plans/$planId/page.tsx` | Tetris (過去+未来統合) + スライダー編集 + milestone 追加ボタン + 確定/archive |

### 4.3 TanStack Query フック (`src/hooks/queries/use-plans.ts` 新規)

`src/hooks/queries/use-problems.ts` と同じ pattern:

```ts
export const plansKeys = {
  all: ["plans"] as const,
  list: (projectId: string) => [...plansKeys.all, "list", projectId] as const,
  detail: (planId: string) => [...plansKeys.all, "detail", planId] as const,
};

export function usePlansList(projectId: string | undefined) { /* useQuery */ }
export function usePlan(planId: string | undefined) { /* useQuery */ }
export function useCreatePlan() { /* useMutation + invalidate list */ }
export function useUpdatePlan() { /* useMutation + invalidate detail/list */ }
export function useArchivePlan() { /* useMutation + invalidate list */ }
```

RPC 経由 (`rpc.api.v1.plans.$post(...)` 等)、`unwrap` 利用。

### 4.4 配分エンジン (`src/lib/plan-allocate.ts` 新規)

```ts
export type AllocatedProblem = {
  problemId: string;
  code: string;
  name: string | null;
  standardTimeSec: number;
  date: string;  // ISO "YYYY-MM-DD"
  overflow: boolean;  // milestone date pile-up なら true
};

export function allocate(
  members: { id: string; code: string; name: string | null; standardTimeSec: number }[],
  consumed: Map<string /*problemId*/, string /*answer.date ISO*/>,
  milestones: Milestone[],
  dailyMinutes: number,
  today: string,
): AllocatedProblem[];
```

純粋関数、Vitest 無くても手動でテストできる小ささに留める。

### 4.5 Tetris 流用 (`ScheduleChart` 一般化)

[src/app/(pages)/schedule/page.tsx:68-290](../../../../Users/m_fukuda/Documents/data-drills-cf/src/app/(pages)/schedule/page.tsx) の `ScheduleChart` を分離・一般化:

**方針**: コピーして `src/components/plan-chart.tsx` を作る (既存を壊さない)。後で共通化を検討。

`ScheduleChart` は `ScheduleRow[]` を消費するので、`AllocatedProblem` を `ScheduleRow` 互換 shape にマッピングして渡す。milestone 縦線と overflow 赤色は plan-chart 側で追加描画。

### 4.6 スライダー流用 (`StabilitySlider` 一般化)

[src/app/(pages)/schedule/page.tsx:294-369](../../../../Users/m_fukuda/Documents/data-drills-cf/src/app/(pages)/schedule/page.tsx) を `src/components/draggable-pin-slider.tsx` として汎用化:

```tsx
type Pin = { id: string; value: number; label: string; color: string };
function DraggablePinSlider({
  pins, max, onChange, onAdd?, onRemove?,
}: { ... });
```

- 既存 schedule page は `Pin[]` を生成して同コンポーネントに渡すよう書き換え (1 ファイル小修正)
- plan page は milestones を `Pin[]` に変換し、`onAdd` で milestone 追加ボタンを実装

### 4.7 サイドバーに追加

[src/components/layout/sidebar.tsx](../../../../Users/m_fukuda/Documents/data-drills-cf/src/components/layout/sidebar.tsx) の `navItems` に:

```tsx
{ href: "/plans", label: "目標", icon: Target },
```

`Target` を `lucide-react` から import。

---

## 5. 実装ステップ

各ステップで動作確認してから次に進む。

| # | ステップ | 完了条件 |
|---|---|---|
| 1 | docs に本計画ファイルをコピー (`docs/plan-management.md`) | 物理ファイル存在 |
| 2 | `plan` テーブル + view 追加 (`src/lib/db/schema.ts` + マイグレーション生成 + 適用) | `pnpm db:generate` → `pnpm db:migrate` 成功、Supabase 上に `plan` テーブルと `view_current_plan` 存在 |
| 3 | `src/lib/schemas/plan.ts` 作成 (Zod) |型が import できる |
| 4 | `src/routes/plans.ts` 新規作成 + `src/lib/hono-app.ts` に組み込み | curl で POST → GET → PUT → DELETE が動く |
| 5 | `src/hooks/queries/use-plans.ts` 作成 | RPC 型がフロントに通る |
| 6 | `src/lib/plan-allocate.ts` 作成 | 既知入力に対して期待出力を返す (手動 console 確認) |
| 7 | `DraggablePinSlider` 抽出 (`src/components/draggable-pin-slider.tsx`) + schedule page 書き換え | 既存 schedule の挙動が変わらない |
| 8 | `PlanChart` 作成 (`src/components/plan-chart.tsx`、`ScheduleChart` ベース) | サンプル data で描画 |
| 9 | `/plans/new` ページ | filter 選択 → プレビュー → 1 plan 作成成功 |
| 10 | `/plans/$planId` ページ | Tetris 表示、milestone 縦線、過去+未来統合 |
| 11 | スライダー編集 + 過密プレビュー + 「確定」で revision 更新 | revision=2 が立ち、view_current_plan が新値を返す |
| 12 | `/plans` 一覧 + サイドバー登録 + archive | 一覧から詳細遷移、archive で消える |

ステップ 1〜6 で DB/API 層完成、7〜11 で UI MVP、12 で運用機能。

---

## 6. 既存実装の再利用 (重要参照)

| 何を | どこから |
|---|---|
| Tetris ベース | `src/app/(pages)/schedule/page.tsx` の `ScheduleChart` (L68-290) |
| Pin スライダー | 同上 `StabilitySlider` (L294-369) |
| `unwrap` + RPC | `src/lib/rpc-client.ts` |
| Query フック pattern | `src/hooks/queries/use-problems.ts` |
| jsonb `$type<>()` | `src/lib/db/schema.ts:161` (`problemPages`) |
| auth middleware | `src/lib/hono-app.ts:44-51` (`/api/v1/*` 配下に自動適用) |
| サイドバー | `src/components/layout/sidebar.tsx:65-76` |
| Hono メソッドチェーン | `src/routes/problems.ts` (RPC 型を壊さない書き方) |

---

## 7. 検証

### 7.1 機能

- [ ] `/plans/new` で plan 作成 → DB に revision=1 が立つ
- [ ] `/plans/$planId` で Tetris が描画され、未来日に未解問題が並ぶ
- [ ] 過去側に初回 answer 済みのメンバー問題が `answer.date` で並ぶ
- [ ] milestone 縦線が表示され、左側ボックス数 ≥ count なら達成色、未満なら未達色
- [ ] daily_minutes をスライダーで下げる → 末尾 milestone date 当日のタワーが伸びる
- [ ] daily_minutes を上げる → タワーが縮む
- [ ] 「確定」で revision=2 が立ち、再読込で新値が反映される
- [ ] archive で `/plans` 一覧から消える
- [ ] アーカイブ済 plan の履歴行 (`plan` テーブルの過去 revision) は物理的に残っている

### 7.2 既存系への非影響

- [ ] `/schedule` の Tetris 表示が plan 機能導入前後で同一 (`DraggablePinSlider` 抽出のリグレッション無し)
- [ ] FSRS 復習スケジュールに影響なし
- [ ] `answer`, `problem` テーブルへの書き込みが本機能経由で発生していない

### 7.3 bitemporal 履歴

- [ ] 同じ plan を 3 回編集 → `plan` テーブルに revision=1,2,3 の行、`valid_to` は 1,2 のみ NOT NULL
- [ ] archive 後も全 revision 行が残存

---

## 8. スコープ外 (将来拡張)

- 複数 plan 間の重複問題の二重計上回避 (= 過密度の補正)。MVP では「ユーザーが filter で管理」
- 履歴閲覧 UI (`/plans/$planId/history`)
- 順序ロジックの動的化 (年度ソート、interleaving、ミス駆動)
- 曜日別 daily_minutes
- Vitest 導入 (`allocate()` の自動テスト)
- カレンダー連携、通知、印刷

---

## 9. リスクと制約

- **問題数 1000 超でレスポンス劣化の可能性**: `GET /api/v1/plans/:id` で全メンバー問題を returns する。Cloudflare Worker CPU 予算は per-request 制限ありのため、500 問前後で要観測。劣化したらメンバー取得を別 endpoint に分離 or page 単位に
- **`ScheduleChart` を fork する技術的負債**: 共通化は後追い。先にコピーで動かして UI 要件が固まってから抽出を検討
- **filter で除外できない「個別問題スキップ」要件**: 現状は filter 経由のみ。「この 1 問だけ外したい」要求が出たら `plan_excluded_problem` テーブルを後追い
