# naming inconsistencies (2026-06-25 時点の棚卸し)

「いつか整理する」候補を 1 箇所に集約。各項目は **問題の特定** に主眼を置き、解決案は併記しない (実際に着手する時に再検討する)。

---

## 1. `review` の多義性

`review` という単語が 4 つの異なる概念で使われている。

| 用法 | 指すもの | 代表的な登場箇所 |
|---|---|---|
| SRS review | 復習サイクル (FSRS 由来の次回 due) | `useSrs`, `srsKeys`, `nextReviewInfo`, `review-next` overlay, `answer-history-overlay.ts` |
| review メモ | 1 つの answer に付ける振り返りメモ (= 失敗ノート) | `routes/reviews.ts`, `reviewsField`, `ReviewBlock`, `data.reviews[].content` |
| review_type | 振り返りメモの種別 (不理解 / 解答パターン 等) | `routes/review-types.ts`, `review_type_id`, `tagMap` |
| ~~review_tag~~ | (削除済) review ↔ review_type の中間 table の旧名 | DB に `reviewTag` table 残置、code 側は 2026-06-25 撤去 |

**症状**: `useSrs` (= 復習スケジュール) と `useReviewsList` (= 振り返りメモ列挙) が一見同じ "review" を扱うように見える。新規実装者が誤読しやすい。`tagMap` (= review_type lookup) も歴史的に `tag` を引きずる。

**観察**: 上 3 つは独立した概念だが、UI 上は「同じ answer に紐づく付加情報」なので 1 view 内で並ぶ。命名で区別を強制するか、accept してドキュメントで明示するか、要判断。

---

## 2. `backlog` の残骸

Phase 4 (2026-06-09) で `backlog` table は drop されたが、命名としては多数残存。

| 場所 | 文脈 | 状態 |
|---|---|---|
| [src/lib/backlog-allocate.ts](src/lib/backlog-allocate.ts) | allocator ロジック本体 (`allocate()`, `AllocatedProblem`, `MemberInput`, `Milestone`) | 現役。utility としての本体機能 |
| `BacklogPrefs` / filter-prefs key `"backlog"` ([use-filter-prefs.ts:53](src/hooks/queries/use-filter-prefs.ts#L53), [scopes/$scopeId/page.tsx:147](src/app/(pages)/scopes/$scopeId/page.tsx#L147)) | scope 編集ページの filter prefs key | DB 上にも `"backlog"` キーで保存済 |
| `usePdfExport("backlog")` ([scopes/$scopeId/page.tsx:110](src/app/(pages)/scopes/$scopeId/page.tsx#L110)) | PDF export kind 識別子 | 識別子の固定値 |
| `confirm("Archive this backlog?")` ([scopes/$scopeId/page.tsx:297](src/app/(pages)/scopes/$scopeId/page.tsx#L297)) | UI 文言 | display 露出 |
| Phase 4 系古コメント | [routes/scopes.ts:9,142,401](src/routes/scopes.ts#L9), [router.tsx:27](src/router.tsx#L27), [hono-app.ts:27](src/lib/hono-app.ts#L27), [member-filter.ts:3](src/lib/schemas/member-filter.ts#L3) | drop 済の経緯説明、現在不要 |

**観察**: `backlog` 概念は `scope` に置き換わったが、allocator のドメインモデル名 (`backlog` = 「やるべき問題の山」) としては自然なので意味は通る。一方で UI/API 識別子としては `scope` に揃えるべき。Phase 4 系コメントは情報として古い (drop は完了済)。

---

## 3. `plan` の display/internal 不整合 (放置決定済)

display "Roadmap" / internal "plan" のミスマッチ。2026-06-25 に **放置で確定**。詳細経緯は memory: `project_plan_roadmap_naming_decision.md`。

但し、関連する派生語が複数命名に残る:

- `PlanPrefs` / filter-prefs key `"plan"` ([use-filter-prefs.ts:56](src/hooks/queries/use-filter-prefs.ts#L56)) — Plan ページの prefs
- `planScheduleColumns` ([plan-schedule-columns.tsx](src/components/plan-schedule-columns.tsx)) — Schedule テーブルの column 定義
- `planDirty` ([use-scope-edit-state.ts](src/hooks/use-scope-edit-state.ts)) — dirty flag
- `reviewPlanToday` / `backlogPlanToday` / `DuePlanCard` / `plannedDoneCount` ([digest/$scopeId/page.tsx](src/app/(pages)/digest/$scopeId/page.tsx)) — 「今日の予定問題集合」のドメイン語 (page 名としての Plan とは別概念)

**観察**: 「page としての Plan」と「今日の plan (= 予定)」が同じ単語を使う。前者は放置決定済だが、後者を rename すると意味が壊れる (今日の予定 = today's plan は自然)。両者は意図的に区別すべきだが、現状コードでは混在。

---

## 4. allocator 命名 (= 上 2, 3 と地続き)

[src/lib/backlog-allocate.ts](src/lib/backlog-allocate.ts) の `allocate()` がやっていること:
- 入力: `MemberInput[]` (scope の member problems) + `Milestone[]` + scheduling 設定
- 出力: `AllocatedProblem[]` (各 problem に date を割り当て)

**名前のずれ**:
- ファイル名は `backlog-allocate.ts` だが、本体は scope の allocator
- 関数名 `allocate()` は ambiguous (allocate 何を?)
- `MemberInput` の "member" は scope.members の意味、ファイル名 backlog と矛盾
- 呼び出し側 (digest/$scopeId, plan, scopes/$scopeId, scopes route) すべてが backlog 抜きの scope 概念で使う

**plan rename の thrash 議論と同形**: meaning-name (allocator, scheduler) でも structural-name (block-allocator) でも 1〜2 セッション議論しないと収まらない可能性。

**観察**: 放置 vs rename のコスト計算は plan と類似。display 露出が無いので「気持ち悪い」のみが reason。

---

## 5. `Planned` / `Unrated` / `First` は本来 `New` に統一すべき

### 背景

answer_status master の `sortOrder = 0` slot は **"New" (no-grade)** として contract 化済 (2026-06-23, memory: `project_status_master_frozen.md`)。つまり「評価なし」を表す **status 名は `New` 1 つだけ**。

ところが過去の rename ([docs/status-name-refactor.md](docs/status-name-refactor.md)) が中途半端で、コード内に `Planned` / `Unrated` / `First` という旧名の文字列リテラルが残存している。

### 概念整理

「評価なし」状態には実は **2 軸の直交分解** が必要:

- **status 軸 (評価軸)**: `New` (= no-grade)。1 種類のみ。
- **時間軸 (位置軸)**: past (= 過去側、actuals overlay) / future (= 未来側、allocator 投影)

過去の rename はこの 2 軸を混同して、「時間軸の値」を「status 軸の値」として命名してしまった:

| 過去の名前 | 本来の分解 |
|---|---|
| `Planned` | status = `New`, 時間 = future |
| `First` | status = `New`, 時間 = past (= 初回着手済) |
| `Unrated` | status = `New`, 時間 = past (= `First` と同義の旧名) |

色は時間軸方向で意図的に分けている (`COLOR_PLANNED` = 鮮やかな purple-400, `COLOR_FIRST_ATTEMPT` = past 用に淡い purple-300)。これは UX 上必要な distinction だが、**status 名ではなく時間軸の属性**として表現すべき。

### 残存箇所

#### status 名としての文字列リテラル

| 場所 | 内容 |
|---|---|
| [src/lib/status-phases.ts:17-18](src/lib/status-phases.ts#L17-L18) | `ALLOC_KIND_PAST: "First"`, `ALLOC_KIND_FUTURE: "Planned"` — allocator kind の文字列定数 (本来は `kind` の識別子と status 名を分離すべき) |
| [src/hooks/queries/use-filter-prefs.ts:29,38](src/hooks/queries/use-filter-prefs.ts#L29) | `hiddenAllocKinds?: ("First" \| "Planned")[]` 永続化型、コメント `("First" + 各 status name)` |
| [src/app/(pages)/plan/page.tsx:130,300-308,376-440](src/app/(pages)/plan/page.tsx#L130) | `hiddenAllocKinds` state + toggle で `"First"` / `"Planned"` をリテラル discriminator として使用 (~15 箇所) |
| [src/components/status-transition-matrix.tsx:99](src/components/status-transition-matrix.tsx#L99) | `from === FIRST_LABEL` (FIRST_LABEL の実値要確認) |
| [src/app/(pages)/scopes/$scopeId/page.tsx:648](src/app/(pages)/scopes/$scopeId/page.tsx#L648) | `<SimpleSortHeader label="First" sortKey="first" ...>` — テーブル列見出し (display 露出) |

#### color 定数名

| 場所 | 内容 |
|---|---|
| [src/lib/block-color.ts:22-23](src/lib/block-color.ts#L22-L23) | `COLOR_PLANNED`, `COLOR_FIRST_ATTEMPT` — 定数名が旧 status 名。意味は「No-grade × future の色」「No-grade × past の色」 |
| [src/lib/answer-history-overlay.ts](src/lib/answer-history-overlay.ts), plan/page.tsx 等 | `COLOR_PLANNED` / `COLOR_FIRST_ATTEMPT` を多数 import |
| [src/components/cycle-time-stats.tsx:2](src/components/cycle-time-stats.tsx#L2) | JSDoc: "Unrated → Solid に達するまでの日数" (display 露出) |

#### display 露出 (UI に表示されているもの)

| 場所 | 内容 |
|---|---|
| [src/app/(pages)/about/page.tsx:172,211-219](src/app/(pages)/about/page.tsx#L172) | About ページの説明テーブル: `Planned` / `Unrated` / `Over budget (Planned 塗り + ...)` 等の語が散在 |
| [src/app/(pages)/digest/$scopeId/page.tsx:1024,1971](src/app/(pages)/digest/$scopeId/page.tsx#L1024) | "Top: Planned (Toggl) / Bottom: Actual (drills)" 等 (← この "Planned" は Toggl の "予定" 時間の意味で、status 名とは別概念。要文脈再判定) |
| [src/components/status-transition-matrix.tsx:1710,1814,1920,2048,2071](src/components/status-transition-matrix.tsx#L1710), [src/app/(pages)/scopes/page.tsx:213](src/app/(pages)/scopes/page.tsx#L213) | JSDoc / コメント: `Unrated`, `Planned/First/Miss/Rough/Fluent/Done` 等の旧名列挙 |
| [src/app/(pages)/scopes/$scopeId/page.tsx:648](src/app/(pages)/scopes/$scopeId/page.tsx#L648) | テーブル列ヘッダ "First" |

#### docs

- [docs/status-name-refactor.md](docs/status-name-refactor.md) — 旧 rename の handoff。`"Unrated" → "New"` を 4 ファイルで rename したと書いてあるが、その後の rename ratchet が止まっている。

### 観察

- **`UNANSWERED_LABEL: "New"` ([status-phases.ts:16](src/lib/status-phases.ts#L16))** は正しい一元化済の legend label。
- **`ALLOC_KIND_PAST: "First"`, `ALLOC_KIND_FUTURE: "Planned"`** は `kind` 識別子の **値** に status 名と同じ string を混在させているのが問題の核。識別子の **キー** (例: `"past"` / `"future"`) と status 名 (常に `"New"`) を分ければ 2 軸が綺麗に分解できる。
- color 定数 `COLOR_PLANNED` / `COLOR_FIRST_ATTEMPT` も意味的には `COLOR_NEW_FUTURE` / `COLOR_NEW_PAST` 等。
- display 露出している "Planned" / "Unrated" / "First" は **すべて誤** (status 名としては存在しないので "New" にすべき)。ただし digest の "Top: Planned (Toggl)" の `Planned` は Toggl の予定時間文脈なので別概念 (= 偶発的 collision)。
- filter-prefs DB key の `("First" | "Planned")[]` は永続化されているので migration が要る (= 既存 prefs 捨てる or 変換)。

### 着手するなら

1. `STATUS_PHASE.ALLOC_KIND_PAST/FUTURE` の値を `"past"` / `"future"` 等の time-axis 識別子に変更し、status 名としての `"First"` / `"Planned"` を全廃。
2. `COLOR_PLANNED` → `COLOR_NEW_FUTURE`, `COLOR_FIRST_ATTEMPT` → `COLOR_NEW_PAST` に rename。
3. plan/page.tsx の `hiddenAllocKinds` state + filter-prefs persistence の値を `("past" | "future")[]` に migrate。
4. display 露出 (about ページ, テーブル列ヘッダ, JSDoc) を `New` に置換。
5. digest の `"Planned (Toggl)"` は Toggl 文脈なので独立、影響無し。

影響範囲は中。filter-prefs migration があるので段階的にやる必要あり。

---

## 6. その他細かい古い情報源

- [src/router.tsx:27](src/router.tsx#L27) — "Phase 3b: backlog → scopes リネーム" コメント。Phase 4 完了で陳腐化。
- [src/routes/scopes.ts:9,142,401](src/routes/scopes.ts#L9) — "Phase 4 で削除する" / "Phase 4 で goal_layer.backlog_id が drop されるまでは" 等の TODO。すべて Phase 4 完了済で陳腐。
- [src/lib/hono-app.ts:27](src/lib/hono-app.ts#L27) — "Phase 6: 新エンティティ routes (旧 projects/tags/backlog は廃止済)" — 説明文として残す価値はあるが、6 という phase 番号は新規読者には文脈不明。
- [src/lib/schemas/member-filter.ts:3](src/lib/schemas/member-filter.ts#L3) — JSDoc が "backlog or review_scope" と書くが、現状は scope 単一。

---

## まとめ (やる時の優先順位 case)

| 優先 | 項目 | 着手条件 |
|---|---|---|
| HIGH | Phase 4 系古コメント除去 (#6) | コストほぼ 0、価値: 新規読者の混乱回避 |
| HIGH | display 露出している `Planned`/`Unrated`/`First` を `New` に置換 (#5) | About ページ + テーブル列ヘッダ等。即可 |
| MID | `STATUS_PHASE.ALLOC_KIND_*` の値を `"past"/"future"` に変更 + COLOR 定数 rename (#5) | filter-prefs DB key migration が要 |
| MID | `BacklogPrefs` / `"backlog"` filter-prefs key rename → `"scope"` 等 | DB migration が必要 (既存 prefs を捨てる or 移行) |
| MID | `usePdfExport("backlog")` 識別子 rename | DB に保存される値ではない、影響範囲は中 |
| MID | "Archive this backlog?" 文言 → "Archive this scope?" | display 露出、即可 |
| LOW | `backlog-allocate.ts` rename / `allocate()` の関数名見直し | plan と同じ thrash risk、現状機能には影響無し |
| LOW | `review` の 4 義性整理 | semantic に近い概念を強引に rename すると別の混乱を生む。doc で明示するのが落とし所か |
| 放置 | `plan` 系 (page 名 + filter-prefs key + dirty flag) | 既に決定済 |
