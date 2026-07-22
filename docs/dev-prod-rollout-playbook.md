# dev/prod パターン横展開 playbook（別リポジトリ用ハンドオフ）

data-drills-cf で確立した dev/prod 分離パターンを、他の Node/TS アプリに適用するための
自己完結プロンプト。**対象リポジトリを開いた新セッションにこの内容を貼る**。優先対象: `data-meals-cf` / `data-memory` / `mcpist-vc`。

---

## このセッションでやること（貼る用プロンプト本文）

> あなたは今 `<repo>` にいる。同じ作者の `data-drills-cf` で確立した **dev/prod 分離パターン**をこのリポジトリに適用する。
> data-drills-cf はローカルの `../data-drills-cf` にあり、参照実装として読んでよい。特に:
> - `src/lib/public-config.ts`（非機密 config-as-code の実装）
> - `src/lib/env.ts`（secret getter だけ残す）
> - `scripts/build-worker.mjs`（worker 用 esbuild define で `import.meta.env.PROD`）
> - `scripts/free-port.mjs`、`package.json`（`bws run --project-id` + free-port）
> - `vite.config.ts`、`wrangler.toml`、`.gitignore`
> - `SECRETS.md` / `docs/gcp-dev-prod-separation.md` / `docs/infrastructure.md` / `docs/dev-prod-rollout-playbook.md`(本書)
>
> **まず現状を精査してから、下記チェックリストを段階的に実行**。破壊的操作（commit/deploy/secret 削除/DB）は必ずユーザー確認。

---

## 貫く原則（不変条件）

**2 バケツだけ。曖昧な第3を作らない。**
- **secret** → 注入（git に置かない）。ローカル=bws、prod runtime=CF Worker Secret。
- **非 secret** → **すべて git 追跡**。`src/lib/public-config.ts` に dev/prod 分岐で集約（ビルド時 tree-shake）。
- 禁止: 「非 secret なのに git 外」（gitignore した非機密 / dashboard のビルド変数 / bws の公開値 / CF binding の非機密）。

---

## Phase 0. 現状精査（コードを変える前に）

このリポジトリについて次を把握する:
1. **ホスティング形態**: CF Worker（`wrangler.toml` + `main`）? Vite SPA? MCP server（`@modelcontextprotocol/*`）? Node service?
   - `import.meta.env.PROD` が使えるか（Vite/esbuild を通るか）を確認。通らない純 Node なら `process.env.NODE_ENV` 等の別フラグで分岐する。
2. **どの公開値があるか**（→ public-config.ts 行き）: baseUrl / clerk publishable key / API key 類 / 公開 URL。
3. **どの secret があるか**（→ bws / runtime）: DATABASE_URL / CLERK_SECRET_KEY / 各種 API secret。
4. **現在の config/secret の置き方**: `.env*` が commit されているか（`git ls-files | grep env`）。**secret が commit ファイルに混入していないか**を最優先で確認。
5. **依存インフラの共有関係**（下記「共有インフラ台帳」と突き合わせる）。

---

## 共有インフラ台帳（data-drills 構築済み。流用可否を判断せよ）

### Neon PostgreSQL（OLTP）
- org `shibaleo`、project **`royal-frost-48342064`「shibaleo shared database」**（`aws-us-west-2`, pg17）。
  **複数アプリの schema が同居する共有 hub**: `data_drills` / `data_meals` / `data_memory`。
- ブランチ: prod=**`production`**（`br-divine-water-akc8zxbr`）、dev=**`development`**（`br-lingering-voice-akiuw5tx`）。
- **重要**: development ブランチは production の CoW 複製なので、**data_meals / data_memory の schema も既に dev ブランチに入っている**。
  → 共有 hub を使うアプリ（meals/memory）は **dev の `DATABASE_URL` を development ブランチの接続文字列に向けるだけ**。新ブランチ作成不要。
- Neon MCP が使える（`mcp__neon__*`）。connection string は `get_connection_string` で取得。
- 別 project を持つアプリなら、その project で同様に development ブランチを切る。

### Bitwarden Secrets Manager（bws）
- project: **`shibaleo-dev-secrets`（`6eece948-709c-4a86-8923-b48e017573b9`）** / **`shibaleo-prod-secrets`（`16c74c07-0fb8-468a-8606-b48e01757644`）**（旧 hub `b49ccb02-…` は温存）。
- `bws run --project-id <id> -- <cmd>` で env 注入。token は 1 本（`.env.local` の `BWS_ACCESS_TOKEN`）で、**`--project-id` で dev/prod を切替**（machine account は分けない）。
- CLI は scoop 導入。**Bash からは `export PATH="$HOME/scoop/shims:$PATH"` が必要**（PowerShell は直接可）。
- **⚠️ multi-app の secret key 衝突を設計せよ**: dev/prod-secrets は現状 data-drills の `DATABASE_URL` / `CLERK_SECRET_KEY` 等を持つ。
  他アプリも同名 key を必要とするなら衝突する。方針を決める:
  - (a) **アプリごとに別 bws project** を作る（`--project-id` でそのアプリのを指す）。最も明快。
  - (b) 共有 project で **app-prefix key**（`MEALS_DATABASE_URL` 等）にし、コード側で読む。
  - ※ `DATABASE_URL` は共有 hub なら値が同一になり得る（同じ Neon、schema 違い）が、`CLERK_SECRET_KEY` はアプリごとに別。混在するので (a) 推奨。

### Clerk
- data-drills は app「shibaleo Auth Hub」の Development(pk_test/sk_test) / Production(pk_live/sk_live) instance。
- **他アプリは自分の Clerk application を持つのが普通**（own pk/sk）。共有なら instance も共有。**要確認**。
- instance ごとに user pool が別。dev では **VSCode 内蔵ブラウザは third-party cookie で Clerk 認証がこけがち → Chrome で確認**。

### GCP（Google 連携がある場合のみ）
- data-drills は `shibaleo-dev-env`(360212971049) / `shibaleo-prod-env`(698047960453) に OAuth client + Picker key。
- Drive 等を使わないアプリは無関係。

---

## Phase 1. コード（公開値を public-config.ts へ）

1. `src/lib/public-config.ts` を作る（data-drills の実装を写経）:
   ```ts
   interface PublicConfig { /* 公開値のみ */ }
   const dev: PublicConfig = { ... }
   const prod: PublicConfig = { ... }
   export const publicConfig: PublicConfig = import.meta.env.PROD ? prod : dev
   ```
2. consumer を `env.*` / `import.meta.env.VITE_*` から `publicConfig.*` に差し替え。`env.ts` は **secret getter だけ**残す。
3. **worker（esbuild）を使うなら** `build-worker.mjs` の `define` に
   `"import.meta.env.PROD": "true"` / `"...DEV": "false"` / `"...MODE": '"production"'` を追加（prod ビルドで分岐解決）。
   - client は Vite が、dev worker（vite `ssrLoadModule`）は Vite が解決。純 Node なら別フラグに置換。
4. `.env` / `.env.development` / `.env.production` を **git から削除**、`.gitignore` で `.env*` 全 ignore。
   `.env.local`（bws token）だけ残す。`wrangler.toml [vars]` / `vite-env.d.ts` の VITE_ 型 / `vite.config` の `dotenv.config()` を掃除。
5. secret env 名を用途スコープに rename（必要なら。例 `GOOGLE_CLIENT_*`→`GOOGLE_DRIVE_CLIENT_*`）。
6. `package.json` の dev/db scripts を `dotenv -e .env.local -- bws run --project-id <dev> -- <cmd>` に。
   （任意）`scripts/free-port.mjs` を写経して dev 起動前にポート解放。**netstat は `-p tcp` を付けない**（IPv6 リッスンを取りこぼす）。

## Phase 2. インフラ（dev/prod 分離）

- **Neon**: 共有 hub なら dev `DATABASE_URL` を development ブランチへ（bws dev-secrets 更新）。独立 DB なら development ブランチを作る。
- **bws**: 上記「衝突設計」に従い dev/prod-secrets（or 専用 project）に secret を配置。
- **Clerk**: dev=pk_test/sk_test、prod=pk_live/sk_live を public-config.ts（pk）と bws/CF Secret（sk）へ。
- **GCP**（あれば）: dev/prod env で OAuth client + API key 発行、public-config.ts と bws に配置。

## Phase 3. cutover（順序厳守。commit が deploy を引くなら最後）

data-drills の runbook（`docs/gcp-dev-prod-separation.md` ★）と同型:
1. prod の公開値を public-config.ts の `prod` に、secret を bws prod-secrets + prod runtime（CF Worker Secret 等）に。
2. **commit 前に prod 側 env/secret を全部揃える**（新コードが読む名前で）。旧名の削除は **deploy 後**。
3. commit → deploy（CF は git 自動。Render/Lambda 等 手動なら別途）。
4. 認証/連携の再接続が要るもの（OAuth token 等）は deploy 後に。
5. 旧 env 名・旧リソースを掃除。

## Phase 4. 検証

- `tsc --noEmit` → 0。
- dev 起動 → 主要機能が dev リソースで動く（Chrome で）。
- **prod ビルドの tree-shake 確認**: `pnpm build` 後、bundle に **dev 値が無く prod 値が焼かれている**か grep。
  （例: `grep -c <dev固有値> dist/... == 0`、`grep <prod固有値> == あり`）
- prod デプロイ後、実 URL で疎通。

---

## 落とし穴（data-drills で踏んだもの）

- **bws `--project-id` 無しだと複数 project の同名 key 衝突**で `Multiple secrets with name` エラー → 必ず `--project-id`。
- **secret を commit ファイルに貼る事故**: `.env.development` 等は公開専用。secret は必ず bws。可能なら pre-commit secret スキャンで機械的に防ぐ。
- **OAuth/API key の redirect/referrer は URL 固定**（localhost:PORT / 本番ドメイン）。dev のポートが変わると壊れる → free-port でポート固定。
- **redirect_uri_mismatch**: prod の connect フローを初めて通すと露呈することがある（token を別経路で使い回していた場合）。redirect URI をクライアントに登録。
- **OAuth client を差し替えると既存の refresh_token は無効**（client 束縛）→ 一度再認可が必要。DB 共有時は特に注意。
- **Clerk は VSCode 内蔵ブラウザで認証こけがち** → Chrome。
- **Neon 共有 hub**: 1 つの DB に複数アプリ schema。ブランチは DB 丸ごと複製（schema 単位で切れない）。dev がうっかり prod DB を触らないよう `DATABASE_URL` の向き先を厳密に。
- **Windows/Bash**: bws は `PATH` に scoop shims。`file://` は `cygpath -m` で。ファイル/env の CRLF に注意（`tr -d '\r'`）。
- **秘密を transcript に出さない**: MCP ツールは値を直書きするので、可能なら REST/CLI + 一時ファイルで注入（Render は `PUT /v1/services/{id}/env-vars/{key}`、Lambda は get→jq/py で merge→update）。

## セキュリティ運用

- ユーザーからの secret 受け渡しは **`.env.local`（gitignore）経由**。読み取り後、用済みの一時値は `.env.local` から除去。
- 各種 API token（CF/Render 等）も一時なら用済みで削除。
