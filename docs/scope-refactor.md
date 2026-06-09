# Scope / Field 大改造プラン

> 起案: 2026-06-08
> 状態: **Phase 1〜4.1 完了 (2026-06-09)**。option C で停止中。Phase 6 (cosmetic rename) は未着手。
> 関連: [scope-refactor-handoff.md](./scope-refactor-handoff.md) (進捗詳細), [CLAUDE.md](../CLAUDE.md) §Pending Development #9
>
> 命名の遷移: 当初 `member_filter` で着手したが、UX 上 `scope` の方が直観的と判断して途中で改名。
> 既存の `review_scope` / `throughput_scope` 等は Phase 4 で削除されるので、最終的には新 `scope` 1 つに統一される。

## 背景と動機

現状の data-drills-cf データモデルは、以下の構造的歪みを抱えている。

- **`project` が二役を兼任**: 期限ある「ワーキングセット」と「学問領域コンテナ」の両方を担っており、project を切替えるたびに subject/level の表示も入れ替わる。実態は「現代文」「微積分」のような学問領域は project に依存せず永続的に存在するもの。
- **`backlog` が member 絞り込み + スケジューリング + 目標を独占**: Review / Throughput / Plan / Stats / Digest など他ページも同じ member 集合を対象にしたいのに、各 scope が `filter` jsonb を自前で持つため重複定義。
- **`tag` の用途偏り**: 事実上 review 評価種別 (`不理解` 等) としてしか使われておらず、`problem_tag` は実質デッド。
- **`topic` の半残置**: UI ページは [削除済 (5f4f7d0)](https://github.com/) だが、テーブル / FK / routes / 一部 UI 参照が残っている。
- **header の project switcher**: Cross-project な member 絞り込みを scope で実現するなら、global な project filter は矛盾を生む。

## 目指す姿

```
user
  ├─owns─> field            (旧 project、永続的な学問領域。owner=user_id)
  │         ├─ subject       (field_id FK)
  │         ├─ level         (field_id FK)
  │         ├─ problem       (field_id, subject_id, level_id)
  │         └─ flashcard     (field_id FK)
  │
  ├─owns─> review_type       (旧 tag、user_id FK)
  │
  ├─owns─> scope     (新規、bitemporal、cross-field 横断可)
  │         ├─ filter spec   ({ fieldIds[], subjectIds[], levelIds[] })
  │         ├─ scheduling    (daily_minutes, weekday_weights, time_multiplier_pct)
  │         ├─ status_stabilities (FSRS パラメタ override)
  │         ├─ goal_layer    (scope_id FK)
  │         └─ goal_milestone (scope_id FK)
  │
  └─ scope (review/throughput/stats/digest)
       └─ scope_id FK (旧 filter jsonb + project_id 廃止)
```

### 削除されるもの

- `project` テーブル (→ `field` にリネーム + 意味変更)
- `topic` テーブル + `*.topic_id` カラム
- `problem_tag` テーブル
- `backlog` テーブル (→ `scope` (旧 member_filter) に吸収)
- header の project switcher

### 新規概念の役割

| 概念 | 役割 | owner | 永続性 |
| --- | --- | --- | --- |
| `field` | 学問領域カテゴリ (簿記、国語、数学等)。subject の親 | user | 永続 |
| `subject` | field 内の分野 (仕訳、現代文等) | field | 永続 |
| `level` | field 内の習熟段階 | field | 永続 |
| `scope` (旧 member_filter) | 期間付きの「視点」。複数 field 横断で問題集合を絞り、スケジュール/目標を保持 | user | bitemporal |
| `review_type` | review 評価ラベル (不理解、理解等) | user | 永続 |

## 設計上の論点と決定

### Q1: `scope` (旧 member_filter) は cross-project か?
**A**: 横断可。`projectIds` ではなく `fieldIds` を持ち、複数 field の subject/level を自由に組み合わせる。

### Q2: project の意味
**A**: 名前を `field` に変更し、意味を「永続的学問領域」に再定義。期限/進捗は scope 側が持つ。

### Q3: スケジューリング (daily_minutes / weekday_weights / FSRS) の所有者
**A**: `scope` (旧 member_filter)。1 つの filter に 1 つのスケジューリング preset。複数 preset が必要なら将来別 entity (β 案)。

### Q4: status_stabilities の管理
**A**: `scope.status_stabilities` jsonb で per-filter override。空ならグローバル `answer_status.stability_days` を fallback として使う。

### Q5: `topic` の扱い
**A**: 完全削除。タグ的横断は scope の filter spec を拡張 (`tagIds[]` 将来追加) で代替。

### Q6: `tag` の扱い
**A**: `review_type` にリネーム。`problem_tag` は廃止 (使われていない)。

### Q7: scope (review/throughput/stats/digest) の `filter` jsonb
**A**: 廃止し `scope_id` FK に置換。

### Q8: header の project switcher
**A**: 廃止。問題作成・マスター編集など「作成コンテキスト」が必要な箇所には inline field picker を配置。

## ファイル影響範囲

### Schema / DB
- `src/lib/db/schema.ts` — 全面改訂
- `drizzle/manual/00X_*.sql` — 新規 5-6 個

### API (`src/routes/`)
- **改訂**: `problems.ts`, `problems-list.ts`, `review.ts`, `backlog.ts`, `flashcards.ts`, `projects.ts`, `throughput.ts`, `throughput-scopes.ts`, `review-scopes.ts`, `stats-scopes.ts`, `digest-scopes.ts`, `master.ts`, `tags.ts`
- **削除**: `project-topics.ts`
- **新規**: `scope.ts`, `field.ts`, `review-types.ts`

### Hooks (`src/hooks/queries/`)
- **改訂**: `use-review.ts`, `use-problems.ts`, `use-throughput.ts`, `use-flashcards.ts`, `use-statuses.ts`, `use-filter-prefs.ts`
- **リネーム**: `use-backlog.ts` → `use-scope.ts`, `use-projects.ts` → `use-fields.ts`, `use-tags.ts` → `use-review-types.ts`, `use-project-data.ts` → `use-field-data.ts`

### UI (`src/app/(pages)/`, `src/components/`)
- **改訂**: 全ページ約 25 ファイル
- **リネーム**: `(pages)/backlog/` → `(pages)/filters/`
- **新規**: `(pages)/filters/$filterId/page.tsx`
- **削除**: header の project switcher

### Hook (`src/hooks/`)
- `use-project.tsx` → `use-field.tsx` リネーム (currentField の意味は "作成コンテキスト")

### その他
- `CLAUDE.md` 更新

## Phasing 戦略

各 phase は独立に release 可能、常に動く状態を保つ。

### Phase 1: 追加のみ (non-breaking)

**Goal**: 新エンティティを並走させる。既存 UI/API は無触。

- (1.1) Schema: `field`, `scope` (旧 member_filter), `review_type` テーブル追加
- (1.2) FK カラム追加 (`*.field_id`, `goal_*.scope_id`, `scope_*.scope_id`)
- (1.3) SQL Migration:
  ```sql
  INSERT INTO field SELECT * FROM project;
  UPDATE subject SET field_id = project_id;
  UPDATE level SET field_id = project_id;
  UPDATE problem SET field_id = project_id;
  UPDATE flashcard SET field_id = project_id;
  INSERT INTO review_type SELECT * FROM tag;
  INSERT INTO scope (..) SELECT (..) FROM backlog;
  UPDATE goal_layer SET scope_id = backlog_id;
  UPDATE goal_milestone SET scope_id = backlog_id;
  -- scope は手動移行 (Phase 3 UI で対応) → 自動化案は Q9 参照
  ```
- (1.4) Typecheck 通過のみ、機能差分ゼロ

**Risk**: 低 (追加のみ、既存コードはそのまま動く)

### Phase 2: API レイヤ切替

**Goal**: 新 route を実装、旧 route は当面残す。

- (2.1) `/api/v1/field`, `/api/v1/scope`, `/api/v1/review-type` 新規実装
- (2.2) `/api/v1/review` に `scope_id` パラメタ追加 (任意、無ければ従来動作)
- (2.3) `/api/v1/backlog` は既存維持

**Risk**: 低-中

### Phase 3: UI レイヤ移行 (最大作業量)

**Goal**: 全ページを新エンティティ経由に書き換え。

- (3.1) `(pages)/filters/` 新設 — scope 管理 UI (list, new, detail)。Backlog UI を移植して milestones / scheduling / FSRS パラメタを統合
- (3.2) Review/Throughput/Stats/Digest/Plan の各 scope ページから「filter 編集」セクション削除、「filter picker」に置換
- (3.3) header の project switcher 削除。Masters / 新規問題作成に inline field picker を配置
- (3.4) Plan ページ: scope の milestones を読んで Tetris に乗せる

**Risk**: 中 (UI 大量変更)

### Phase 4: 旧エンティティ削除

**Goal**: vestigial を全部消す。

- (4.1) Drop `topic`, `problem_tag`, `backlog`, `project` テーブル
- (4.2) Drop `*.project_id`, `*.topic_id`, `goal_*.backlog_id` カラム
- (4.3) `tag` テーブル名 → `review_type` (Phase 1 でコピー済み、データ的には rename)
- (4.4) 旧 routes (`/api/v1/backlog`, `/api/v1/projects` 等) 削除
- (4.5) 旧 hooks 削除

**Risk**: 中 (削除なので戻せない)

### Phase 5: 仕上げ + 本番デプロイ

- (5.1) `CLAUDE.md` 全面更新
- (5.2) memory 更新
- (5.3) Field / Scope / ReviewType の用語をコード / ドキュメント / UI で統一
- (5.4) 旧 "Backlog" / "Topic" / "Tag" 言及を一掃
- (5.5) taxtant 側の変更を同時にマージ (上記「taxtant の対応」参照)
- (5.6) 本番 DB に SQL migration を適用
- (5.7) Cloudflare Workers 本番デプロイ
- (5.8) taxtant の動作確認 (1 問 dry-run)

## 決定事項

### D1: scope の filter 自動移行 → **(α) 自動生成する**

各 scope (review_scope / throughput_scope / stats_scope / digest_scope) は Phase 1 で自動的に scope 行を生成し、FK 接続する。命名規約: `"{scope名} (auto)"`。不要なものはユーザが後から削除。

### D2: 本番デプロイ → **最後に 1 回**

Phase 1〜5 はローカルでコミットして積む。本番デプロイは Phase 5 完了後にまとめて 1 回。中間状態 (API 新旧並走、テーブル並走) は本番には出ない。

### D3: Drizzle migration 管理 → **manual SQL 継続**

既存流儀 (`drizzle/manual/`) を維持。

### D4: 移行後の規模感 → **実害なし**

scope 自動生成で生まれる行数は project × scope_type ≒ 10 行程度。

## デプロイ後の周辺対応

- 既存 `drizzle/manual/` の SQL に頼っているデプロイフロー (Supabase SQL editor 手動実行) は変更なし
- Render PDF サービスは影響なし

## taxtant (外部 Python 同期ツール) の対応

場所: `G:\マイドライブ\root\taxtant\drills_client.py`

### 影響を受ける呼び出し

taxtant は data-drills-cf の REST API を呼ぶ Python クライアント。本 refactor で全 endpoint の `project_id` が `field_id` に変わるため、以下を更新する必要がある:

| 旧 endpoint / param | 新 endpoint / param |
| --- | --- |
| `GET /api/v1/projects` | `GET /api/v1/fields` |
| `GET /api/v1/projects/:id/subjects` | `GET /api/v1/fields/:id/subjects` |
| `GET /api/v1/projects/:id/levels` | `GET /api/v1/fields/:id/levels` |
| `GET /api/v1/problems-list?project_id=` | `GET /api/v1/problems-list?field_id=` |
| `POST /api/v1/problems` body `project_id` | body `field_id` |

### taxtant 側のコード変更

`drills_client.py` の以下メソッドをリネーム/置換:

- `find_project_by_code` → `find_field_by_code`
- `list_subjects(project_id)` → `list_subjects(field_id)` (引数名のみ、内部 endpoint 変更)
- `list_levels(project_id)` → `list_levels(field_id)`
- `list_problems_with_files(project_id)` → `list_problems_with_files(field_id)`
- POST `/api/v1/problems` payload の `project_id` → `field_id`
- 内部の `Project` dataclass → `Field` にリネーム

呼び出し側 (`sync.py`, `build_training_problems.py`, etc) も同様。

### 同期デプロイ手順

本番デプロイ前に:

1. taxtant 側の変更を別ブランチで作成 (data-drills-cf の Phase 4 と同じタイミングで commit)
2. data-drills-cf 本番デプロイ → 同日中に taxtant の変更を main へマージ
3. 検証: taxtant の dry-run (1 問だけ POST) で疎通確認

または **より安全には**: Phase 2-4 の API で `project_id` を `field_id` の alias として一定期間受け付けるオプションも検討可能。ただし本 refactor の規模を考えると alias 維持コストの方が高い。

### 認証/権限

taxtant は API Key で認証している。API Key 自体は user_id に紐づくので、field 移行後も認証ロジック変更不要。

## 移行後の API 互換性

完全な breaking change。旧 client (もしあれば) は動かなくなる。data-drills-cf 自身の Web UI と外部 Python ツールのみが consumer なので、両方を同期更新できる前提。

## 想定スケジュール

| Phase | 概算工数 (セッション) | 累計 |
| --- | --- | --- |
| 1: 追加のみ | 2 | 2 |
| 2: API 切替 | 2 | 4 |
| 3: UI 移行 | 4 | 8 |
| 4: 削除 | 1 | 9 |
| 5: 仕上げ | 1 | 10 |

合計 約 10 セッション。各セッションが 1-2 時間として、10-20 時間相当。

## リスクと緩和策

| リスク | 緩和策 |
| --- | --- |
| Phase 3 でリグレッション多発 | 各ページ移行ごとに動作確認、PR を細かく分ける |
| データ移行失敗で破損 | Phase 1 SQL は dry-run で件数確認、本番適用前に DB backup |
| scope UI が複雑化 | Backlog UI を流用するが、scheduling と FSRS 設定の表示を折りたたみ可能に |
| 移行中の中間状態 (Phase 2 完了時点) で混乱 | API 新旧並走を許容、UI 切替は Phase 3 で一気に |

## 関連メモ

- 既存 backlog UI で milestone 編集ができる構造は scope に流用する
- FSRS パラメタは backlog UI に既存の "stability slider" を再利用
- review allocator (`/api/v1/review`) の `scope_id` 指定時は `status_stabilities` で `stabilityDays` を override
- Plan ページの smooth-progression projection は `scope.status_stabilities` を読む形に修正
