# CLAUDE.md — data-drills-cf

## Project Overview

問題演習管理アプリ。Cloudflare Workers + Pages でホスト。

### Architecture

```
CF Pages (React + Vite SPA, TanStack Router)
  └─ CF Worker (Hono API)
       ├─ Supabase PostgreSQL (トランザクション DB)
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
| DB             | Supabase PostgreSQL                                      |
| Auth           | Clerk                                                    |
| PDF            | Render Docker service (services/pdf/)                    |

### Key Features

- 問題演習 (problems, answers, flashcards)
- 間隔反復 (FSRS algorithm)
- Markdown ノート (CodeMirror + KaTeX)
- PDF 同期 (Google Drive → 問題抽出)
- 分析ダッシュボード (retention, scores)

## Deployed Services

- **CF Worker**: data-drills-cf (本番)
- **PDF Service**: https://pdf-service-r4i7.onrender.com (Render, free plan, Singapore)
  - Service ID: `srv-d7k658ho3t8c738s0flg`
  - Root directory: `services/pdf`
  - 認証: `x-pdf-service-key` ヘッダー
  - 用途: **export のみ** (選択問題の印刷用 PDF レンダリング)。scan/apply は外部化済み (下記)

## PDF パイプライン (外部化済み)

- PDF スキャン / 問題データ抽出 / 一括インポートは **外部の Python ツール** で実装
  - 場所: `G:\マイドライブ\root\taxtant`
  - 認証: data-drills の API Key で `/api/v1/problems`, `/api/v1/problems/:id/files`, `/api/drive/link` を呼ぶ
- data-drills 側には CRUD API と export 専用の `/api/v1/pdf-export` プロキシのみ残す

## Pending Development

### 1. Toggl ウィジェット
- Neon DWH からTogglの勉強時間を取得してダッシュボードに表示
- 目的: 勉強時間の最大化（毎日 drills を使うので、ここに表示すれば Toggl を見に行く必要がない）
- データソース: `neon_db.data_warehouse.fct_toggl_time_entries`
- 接続先: Neon PostgreSQL (読み取りのみ)

### 2. CodeMirror の洗練
- Markdown 入力 UX の改善
- 関連ファイル:
  - `src/components/codemirror-editor.tsx` — メインエディタ
  - `src/components/markdown-editor.tsx` — 遅延ロードラッパー
  - `src/lib/codemirror-extensions.ts` — カスタムプラグイン

## Conventions

- Language: TypeScript
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
