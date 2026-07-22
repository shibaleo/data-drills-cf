# Secrets & Config — data-drills-cf

このアプリの secret / config の置き場所と、新しいマシン・クローンでのセットアップ手順。

## TL;DR（新規クローンのセットアップ）

1. `bws` CLI を入れる（未導入なら https://github.com/bitwarden/sdk-sm のリリースから）
2. `.env.local` を作り、`BWS_ACCESS_TOKEN` を1行だけ書く
   （値 = Bitwarden Secrets Manager の machine account `shibaleo-bitwarden-machine-account` の access token）
   ```
   BWS_ACCESS_TOKEN=<bitwarden machine account token>
   ```
3. `pnpm install && pnpm dev`

これだけで動く。実 secret は Bitwarden から自動注入され、非機密 config は commit 済み。
**環境ごとに用意するのは `.env.local` の token 1つだけ。**

## 置き場所の区分け

**原則 (2026-07-22 確定): 2 バケツだけ。曖昧な第3を作らない。**
- **secret** → 注入 (git に置かない)。ローカル=bws、prod runtime=CF Worker Secret。
- **非 secret** → **すべて git 追跡**。`src/lib/public-config.ts` に dev/prod 分岐で集約 (ビルド時 tree-shake)。
- 禁止: 「非 secret なのに git 外」(gitignore した非機密 / CF dashboard のビルド変数 / bws の公開値 / CF binding の非機密)。

| 種類 | 例 | 場所 | git |
|---|---|---|---|
| 実 secret（consume する外部 credential） | `DATABASE_URL` `CLERK_SECRET_KEY` `GOOGLE_DRIVE_CLIENT_SECRET` `AWS_*` `PDF_SERVICE_KEY` `NEON_DATABASE_URL` | **Bitwarden Secrets Manager** `shibaleo-{dev,prod}-secrets`（token の `--project-id` で切替）+ prod runtime は CF Worker Secret | — |
| bootstrap token（bws を開ける鍵） | `BWS_ACCESS_TOKEN` | `.env.local` | ignore |
| **非機密 config（全部）** | `baseUrl` `clerkPublishableKey`(pk_test/pk_live) `googleDriveClientId` `googlePickerApiKey` `pdfApiUrl` | **`src/lib/public-config.ts`**（dev/prod 分岐・型付き・`import.meta.env.PROD` で選択） | **commit** |
| wrangler dev/preview 用 secret | ローカル `wrangler dev` が読む | `.dev.vars` | ignore |

**`.env*` は全て gitignore（`.env.local` の bws token だけローカルに存在）。** public-config.ts が非機密の単一ソース。

### 原則

- **実 secret は git に置かない → bws が SSOT。**
- **非機密（クライアントに配布される公開値）は commit する。** dev/prod で違う値は Vite の `.env.[mode]` が build mode で自動選択する（環境ごとにブランチを分けない）。
- **環境ごとの上書き・bootstrap token は `.env.local`（gitignore）。**

## 注入の仕組み

`package.json` の dev / db / bootstrap スクリプト:

```
dotenv -e .env -e .env.development -e .env.local -- bws run -- <cmd>
```

1. `dotenv-cli` が `.env` / `.env.development` / `.env.local` を process.env に load（token 含む）
2. `bws run` が Bitwarden Secrets Manager から実 secret を注入
3. その環境で本来のコマンド（vite / drizzle-kit / tsx）を実行

`pnpm build`（prod）は Vite が `.env` + `.env.production` を読んで pk_live を焼く（secret は build に不要）。

## bws（Bitwarden Secrets Manager）

- project: `shibaleo-secrets-hub`
- machine account: `shibaleo-bitwarden-machine-account`（read アクセス付与済み）
- secret の追加/更新: Bitwarden Web UI か `bws secret create <KEY> <VALUE> <project-id>`
- token 認証は `BWS_ACCESS_TOKEN` env（このアプリは `.env.local` から dotenv-cli で供給）

## secret / config を足す時の判断

- **外部から貰う credential・漏れたら困るもの** → bws
- **クライアントに配布される公開値**（publishable key, client id, API endpoint 等）→ `.env`（共通）or `.env.[mode]`（環境差）に commit
- **自分が発行するもの**（JWT 署名鍵など）→ 各アプリ側 / host secret store。bws に集約しない
