# data-drills-cf → Vercel 移行計画

作成: 2026-07-22

## 前提・方針
- **`data-drills-cf`（本命・CF Worker）を Vercel に組み替える。**
- `data-drills-vc`（分岐した Vercel 版の再設計）は**破棄**。`data-drills`（無印・Next.js 残骸）も**退役**。
- CF は compute から降り、**DNS/レジストリ母艦に徹する**（`drills.shibaleo.uk` の DNS を Vercel へ向け替え）。
- 動機: Hyperdrive の設定が面倒／Vercel なら Neon に直通（-pooler or IPv6）／deploy 機構を Vercel 1系統に寄せて二重保守を止める。mcp-postgresql・mcp-memory と同じ形に揃う。
- アプリ本体は既に **Vite SPA + Hono API**。触るのは基本 **deploy 層だけ**（機械的・低リスク）。
- ⚠️ 破棄する `data-drills-vc` だが、その deploy 層ファイル（`vercel.json` / `scripts/build-api.mjs` / `api/index.ts` / `src/server-entry.ts` / Neon 直の `db/index.ts`）は **cf を Vercel 化する際のテンプレートとして流用**できる（機能は捨てても足場は使える）。

## 現状 → 目標（deploy 層の対比）
| 項目 | 現状 (cf / CF Worker) | 目標 (Vercel) |
|---|---|---|
| ルーティング/設定 | `wrangler.toml` | `vercel.json`（`/api/*`・`/.well-known/*`→Function、SPA fallback、regions sfo1、functions.maxDuration） |
| サーバービルド | `scripts/build-worker.mjs`（esbuild → `dist/_worker.js`） | `scripts/build-api.mjs`（esbuild → `api/_bundle.mjs`）。`import.meta.env.PROD` の define は継続 |
| エントリ | Worker default fetch export | `api/index.ts` が `_bundle.mjs`(Hono app) を re-export |
| DB 接続 | **Hyperdrive バインディング**が prod の接続を供給 | `process.env.DATABASE_URL`（**Neon -pooler 直 / IPv6**）。`search_path=data_drills` は継続 |
| runtime secret | **CF Worker Secret**（`wrangler secret put` / `set-cf-secrets.mjs`） | **Vercel Production env**（`set-vercel-secrets.mjs` で bws prod-secrets → push） |
| デプロイ | `bws run(hub) -- wrangler deploy` | `bws run(hub) -- vercel deploy --prod` ＋ push で Git 自動デプロイ |
| ドメイン | `drills.shibaleo.uk` → CF Worker | `drills.shibaleo.uk` → Vercel（DNS grey-cloud。shibaleo.uk サブドメインなので live Clerk 継続） |

## 手順
1. **Vercel プロジェクト用意**: 新規作成 or 破棄する `data-drills-vc` の Vercel プロジェクトを流用（`drills.shibaleo.uk` を移す先）。`.vercel/project.json` をリンク（ID は非 secret なので追跡化してよい）。
2. **deploy 層の移植**（vc の該当ファイルを雛形に）:
   - `scripts/build-api.mjs` を追加（`build-worker.mjs` を置換）。`vite build && node scripts/build-api.mjs` に。
   - `api/index.ts` ＋ `src/server-entry.ts`（Hono app を default export → bundle）を用意。
   - `wrangler.toml` を廃し `vercel.json` を追加。
   - `.gitignore` に `api/_bundle.mjs`・`.vercel/*`(project.json 例外) を反映。
3. **DB 接続を Hyperdrive → env に**:
   - `src/lib/db/index.ts` が Hyperdrive バインディング（`env.HYPERDRIVE...`）を読んでいる箇所を `process.env.DATABASE_URL` に。**要確認**: CF Worker 固有 API（bindings 等）への依存が db 以外に無いか grep。
   - `DATABASE_URL` は Neon の **-pooler**（serverless 前提）。dev=development / prod=production ブランチ。bws dev/prod-secrets の値をそのまま。
4. **secret を Vercel env へ**:
   - cf の runtime secret を洗い出す（`scripts/set-cf-secrets.mjs` の KEYS ＋ Hyperdrive 供給の `DATABASE_URL` ＋ Google/Toggl 連携系）。想定: `CLERK_SECRET_KEY` / `DATABASE_URL` / Google OAuth（drive/google-auth 用の client secret 等）/ Toggl / `SERVER_JWT_*` があれば。
   - `scripts/set-vercel-secrets.mjs`（mcp-postgresql の同名スクリプトを雛形）で prod-secrets → Vercel Production env に push（値非表示）。KEYS を上で洗い出した集合に。
   - `package.json` の `deploy` / `secrets:prod` を Vercel 版に（`bws run(hub) -- vercel deploy --prod` / `node scripts/set-vercel-secrets.mjs`）。
5. **公開値**: `src/lib/public-config.ts` は既存（baseUrl を prod=`https://drills.shibaleo.uk` に。dev=null）。`build-api.mjs` の define で `import.meta.env.PROD=true` を注入。
6. **CI 追加**: `.github/workflows/ci.yml`（pnpm typecheck + build）。他リポと同型。
7. **cutover**:
   1. Vercel Production env を揃える（手順4）。
   2. `vercel deploy --prod` で Vercel 側に本番デプロイ、`*.vercel.app` で疎通確認（health / 主要ページ / DB 読み書き）。
   3. `drills.shibaleo.uk` の DNS を CF Worker → Vercel に向け替え（grey-cloud）。Clerk 登録ドメインは不変なので再設定不要。
   4. 実ドメインで最終確認。
8. **退役**:
   - CF: data-drills-cf の Worker / Workers Builds / Hyperdrive config を削除。
   - `data-drills-vc`: GitHub リポ + Vercel プロジェクト削除。
   - `data-drills`（無印 Next.js）: GitHub リポ + Vercel プロジェクト削除。

## リスク・注意
- **DB クライアントの CF 依存**: `postgres` を Hyperdrive 前提で初期化していないか。Vercel(Node) では `process.env.DATABASE_URL` に直結でよいが、接続数（serverless の warm/cold）に注意 → `max:1` / idle_timeout 短め、pooler 利用。
- **CF Worker 固有 API**: bindings / `caches.default` / `ctx.waitUntil` 等を使っていないか grep。使っていれば Node 相当に置換。
- **secret 洗い出し漏れ**: Google/Toggl 連携があるので Clerk+DB 以外の secret を必ず列挙。1つでも欠けると該当機能が prod で無言で失敗する（health で has* 確認を推奨）。
- **schema**: `data_drills` を継続利用。vc を破棄するので「同一スキーマを二製品が触る」問題は解消（cf のテーブルのみが正）。
- **maxDuration**: PDF 生成・warehouse 系で長い処理があるなら `vercel.json` の `functions.maxDuration` を 60〜300 に。

## 見積り
- deploy 層の移植 + cutover: 既知 playbook（mcp-postgresql/mcp-memory/meals で3回実施済み）×1。実働おおよそ **半日〜1日**、低リスク。
- 機能改修は無し（アプリ本体は Vite+Hono のまま）。

## 参考
- `docs/dev-prod-rollout-playbook.md`（本リポ）
- mcp-postgresql / mcp-memory の `MIGRATION.md` / `SECRETS.md`（CF/Vercel deploy 層の実例）
- 破棄する `data-drills-vc` の deploy 層ファイル（雛形として参照後に破棄）
