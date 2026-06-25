# CLAUDE.md — data-drills-cf

## Project Overview

問題演習管理アプリ。Cloudflare Workers + Pages でホスト。

### Architecture

```
CF Pages (React + Vite SPA, TanStack Router)
  └─ CF Worker (Hono API)
       ├─ Neon PostgreSQL × 2
       │    ├─ トランザクション DB (data_drills schema、DATABASE_URL)
       │    └─ DWH (data_warehouse/data_presentation、NEON_DATABASE_URL)
       ├─ Render Docker (PDF 処理サービス, services/pdf/)
       └─ Clerk (認証)
```

### Tech Stack

| Layer          | Technology                                               |
| -------------- | -------------------------------------------------------- |
| Frontend       | React 19, Vite, TanStack Router, Tailwind v4             |
| UI             | Radix UI, Recharts, React PDF, Sonner                    |
| Editor         | CodeMirror 6 (@uiw/react-codemirror)                     |
| Server state   | TanStack Query (React Query)                             |
| Forms          | React Hook Form + `@hookform/resolvers/zod`              |
| Validation     | Zod (shared), `@hono/zod-validator`, `drizzle-zod`       |
| API            | Hono on CF Workers (`AppType` + RPC client `src/lib/rpc-client.ts`) |
| ORM            | Drizzle                                                  |
| DB             | Neon PostgreSQL (data_drills schema)                     |
| Auth           | Clerk                                                    |
| PDF            | Render Docker service (services/pdf/)                    |

### Key Features

- **Plan** — FSRS を参考にしたスケジューリングアルゴリズムでの復習 + 配分 Tetris。過去実績 (answer-history overlay) + 未来予測 (smooth-future / review-next) を 1 view に統合 (2026-06-12 に旧 Review/Throughput ページを吸収)
- **Scope** — cross-field 横断可能な member 絞り込み (`fieldIds[]/subjectIds[]/levelIds[]`) + scheduling (daily_minutes, weekday_weights) + milestone 配分 Tetris を 1 entity に統合。bitemporal 履歴付き
- **Flashcards** — Markdown 表裏のフラッシュカード演習
- **PDF エクスポート** — 選択問題を Render サービスで PDF 結合

### Status 位相 (2 軸モデル, 2026-06-12 確定)

ステータス集合は単一 ordinal ではなく **時間軸 × 評価軸 + メタ**:

- **時間軸**: past / future (past は PAST_ALPHA で沈める)
- **評価軸**: `no-grade (Planned/Unrated)` → Miss → Rough → Fair → Fluent → **Solid** (旧 Done を rename, 2026-06-11)
- **メタ**: Over budget / Overflow (塗らず border のみ)

Planned (未来 no-grade) と Unrated (過去 no-grade、旧 First) は同 phase の時間両端で同色 (purple-300/400)。詳細: [docs/ui-refinement-open-questions.md](docs/ui-refinement-open-questions.md), 実装: [src/lib/block-color.ts](src/lib/block-color.ts)

### Domain Model (Phase 4 完了後)

```
user
  ├─ field         (永続的な学問領域。subject/level/problem/flashcard の親)
  ├─ review_type   (review 評価種別。Miss/Rough/Fair/Fluent 等)
  └─ scope         (bitemporal、cross-field 横断 member filter + scheduling + goals)
        ├─ goal_layer / goal_milestone (scope_id FK)
        └─ stats_scope / digest_scope は scope_id FK で接続 (review_scope / throughput_scope は 2026-06-12 にコード側削除、DB table は温存)
```

- 旧 `project`/`backlog`/`tag`/`topic`/`problem_tag` は drop 済 (2026-06-09)
- Phase 6 cosmetic rename 完了済 (2026-06-09, commit `5b8a0da`): `project_id` → `field_id`、`tag_id` → `review_type_id` を schema/wire/列名すべて統一。Toggl の `project_id` (外部概念) と `masters/page.tsx` 内部 `Project` alias のみ意図的に温存
- 詳細: [docs/scope-refactor.md](docs/scope-refactor.md), [docs/scope-refactor-handoff.md](docs/scope-refactor-handoff.md)

## Deployed Services

- **CF Worker**: data-drills-cf (本番)
- **PDF Service**: https://pdf-service-r4i7.onrender.com (Render, free plan, Singapore)
  - Service ID: `srv-d7k658ho3t8c738s0flg`
  - Root directory: `` (repo root) ※ 2026-06-11 monorepo 分割で変更。Render dashboard 上の rootDir を `services/pdf` → 空欄に、Dockerfile path を `services/pdf-render/Dockerfile` に更新する必要あり
  - 認証: `x-pdf-service-key` ヘッダー
  - 用途: **export のみ** (選択問題の印刷用 PDF レンダリング)。scan/apply は外部化済み (下記)
  - Lambda 移行後はフォールバック経路として温存 (詳細: [docs/pdf-lambda-migration.md](docs/pdf-lambda-migration.md))

### PDF パッケージ構成 (2026-06-11〜)

```
services/
├── pdf-core/    フレームワーク非依存。Hono app factory + lib + routes (createApp({ fontPath }))
├── pdf-render/  Render 用の薄いラッパ。@hono/node-server で createApp() を listen
└── pdf-lambda/  AWS Lambda 用の薄いラッパ。hono/aws-lambda の handle() で createApp() を export
```

pdf-core は両 wrapper に workspace dep として参照される (`@data-drills/pdf-core: workspace:*`)。フォントアセット (`assets/fonts/yumin.ttf`) は pdf-core が保持し、Dockerfile で各 wrapper に copy される。フォールバック切り替えは CF Worker 側の `/api/v1/pdf-export` プロキシで実装 (Lambda → Render の 5xx/timeout 自動切替)。

### Lambda 本番経路 (2026-06-11〜)

- **AWS Lambda `pdf-export`** (ap-northeast-1, arm64, 2048 MB, Invoke API 経由)
- 認証: CF Worker → SigV4 (`cf-worker-pdf` IAM user) → Lambda Invoke API
- **S3 staging**: Lambda が PDF を `data-drills-pdf-export-shibaleo` バケットに PUT、CF Worker が同じ SigV4 client で GET (Invoke API の 6 MB 応答上限回避)
- ライフサイクルポリシー: 1 日後に自動削除
- レイテンシ: 7s (Render free plan の 27s 比 4 倍速)
- 詳細: [docs/pdf-lambda-migration.md](docs/pdf-lambda-migration.md)

## PDF パイプライン (外部化済み)

- PDF スキャン / 問題データ抽出 / 一括インポートは **外部の Python ツール** で実装
  - 場所: `G:\マイドライブ\root\taxtant`
  - 認証: data-drills の API Key で `/api/v1/problems`, `/api/v1/problems/:id/files`, `/api/drive/link` を呼ぶ
- data-drills 側には CRUD API と export 専用の `/api/v1/pdf-export` プロキシのみ残す

## Pending Development

### 機能開発

#### 1. Toggl ウィジェット
- Neon DWH から Toggl の勉強時間を取得してダッシュボードに表示
- 目的: 勉強時間の最大化（毎日 drills を使うので、ここに表示すれば Toggl を見に行く必要がない）
- データソース: `neon_db.data_warehouse.fct_toggl_time_entries`
- 接続先: Neon PostgreSQL (読み取りのみ)

#### 2. CodeMirror の洗練
- Markdown 入力 UX の改善
- 関連ファイル:
  - `src/components/codemirror-editor.tsx` — メインエディタ
  - `src/components/markdown-editor.tsx` — 遅延ロードラッパー
  - `src/lib/codemirror-extensions.ts` — カスタムプラグイン

### インフラ / 品質

#### 3. Vitest 導入
- リグレッション防止。フレームワーク刷新直後で土台を敷く好機
- docs/framework-proposal.md §5 で保留判断

#### 4. CodeMirror バンドル分割
- 現状 1.5MB の単一 chunk。動的 import で code-split 可能

### 将来の検討事項 (発生したら対応)

#### 5. `@hono/zod-openapi` への移行
- API を外部クライアント (SaaS、MCP モジュール等) に公開するタイミングで
- Zod スキーマは再利用できるので移行コストは低い (docs/framework-proposal.md §4.4)

#### 6. Sentry 等のエラー監視
- 本番運用開始時に導入 (docs/framework-proposal.md §5)

#### 7. `AppType` コンパイル時間
- 現状問題なし。ルート数が増えて肥大化したら v1 を複数アプリに分割 (docs/framework-proposal.md §7)

#### 8. `unwrap` 内部の narrowing cast
- [src/lib/rpc-client.ts](src/lib/rpc-client.ts) の `as SuccessBody<T>` 1 箇所
- TypeScript の generic narrowing 制限を回避するための cast
- `isErrorBody` ガードで runtime 保証済み、意図的な妥協として維持

## Conventions

- Language: TypeScript
- **UI 文言は英語で統一** (ボタンラベル / tooltip / toast 等は英語。コメントとログは日本語可)
- Package manager: pnpm
- Monorepo: `services/pdf/` に PDF 処理サービスを同居
- CF Worker entry: `src/cf-worker-entry.ts`
- API routes: `src/routes/*.ts`
- Pages: `src/app/(pages)/`
- Zod schemas: `src/lib/schemas/`
- Query hooks: `src/hooks/queries/`

### データ取得 / フォーム / バリデーション規約

- **サーバー状態は TanStack Query**
  - 新規の API 呼び出しは `useState` + `useEffect` で書かない。`src/hooks/queries/` にフックを追加し `useQuery` / `useMutation` を使う。
  - `QueryClient` の既定値は `src/lib/query-client.ts` に集約。個別上書きは例外扱い。
  - mutation では必要に応じて `invalidateQueries` を呼ぶ。クエリキーは各フックの `*Keys` 定数を使う (例: `problemsKeys.list(projectId)`)。

- **API 呼び出しは Hono RPC (`rpc` from `src/lib/rpc-client.ts`)**
  - 新規の API 呼び出しは RPC 経由で型を通す。例: `rpc.api.v1.problems[":id"].$put({ param: { id }, json: {...} })`
  - `AppType` は [src/lib/hono-app.ts](src/lib/hono-app.ts) からエクスポート、`import type` で取り込むこと (サーバー依存が client bundle に入らない)
  - 各ルートファイルはメソッドチェーン (`new Hono().get(...).post(...)`) で定義する。途中で `app.get()` を別文にすると型が累積しないので RPC に現れない
  - 動的フィールド更新 (例: `{ [field]: value }`) など RPC の厳格な型に収まらない呼び出しは既存の `api` fetch ラッパー ([src/lib/api-client.ts](src/lib/api-client.ts)) をフォールバックとして使う
  - OpenAPI 公開が必要になった時点で `@hono/zod-openapi` に移行する (Zod スキーマは再利用可能)

- **フォームは React Hook Form + zodResolver**
  - 2 フィールド以上のフォームは必ず `react-hook-form` + `@hookform/resolvers/zod` を使う。フィールドごとの `useState` を新規に書かない。
  - バリデーションスキーマは `src/lib/schemas/` に置き、フロント/バックで共有する。

- **API 境界は Zod で検証**
  - 新規 Hono ルートの POST/PUT/PATCH は `zValidator("json", schema)` を必ず挟む。ハンドラ内では `c.req.valid("json")` を使う (`c.req.json()` を直接触らない)。
  - DB 行型が必要な場合は `drizzle-zod` の `createSelectSchema` から導出する。
  - API 入力は snake_case、Drizzle は camelCase。ハンドラ内でマッピングする (`src/routes/problems.ts` が参考実装)。
