# data-drills — Web インフラ / サービス構成

現在アプリが依存する外部サービスの棚卸し。最終更新: 2026-07-22 (dev/prod 分離 cutover 完了時点)。
※ ここに載る ID は識別子（account/project/service/branch ID・endpoint host・公開 client ID）で秘密ではない。
実 secret は bws / CF Worker Secret にあり、ここには書かない ([SECRETS.md](../SECRETS.md))。

## 全体像

```
                              drills.shibaleo.uk
                                     │
                    ┌────────────────▼─────────────────┐
                    │  Cloudflare Worker  data-drills-cf │  React SPA(static assets) + Hono API
                    │  (git 連携で main push 時に自動 deploy) │
                    └───┬──────────┬─────────────┬───────┘
                        │          │             │
              Hyperdrive│     Clerk│        SigV4 │ (Invoke API)
                        │  (Auth)  │             │
             ┌──────────▼──┐  ┌────▼────┐   ┌────▼──────────────┐
             │ Neon PG      │  │ Clerk    │   │ AWS Lambda        │  PDF export (primary)
             │ (OLTP, 共有 hub)│  │Auth Hub │   │ pdf-export        │  ← 手動 zip deploy
             └──────────────┘  └─────────┘   └────┬──────────────┘
             ┌──────────────┐                     │ 5xx/timeout 時 fallback
             │ Neon DWH      │(read-only)     ┌────▼──────────────┐
             │ (別アカウント)  │                │ Render pdf-service │  PDF export (fallback)
             └──────────────┘                └───────────────────┘
                                             ┌───────────────────┐
   Drive OAuth / Picker  ── GCP shibaleo dev/prod env             │
   Drive にファイル格納 ── オーナーの Google Drive (user OAuth)      │
```

外部の取り込みツール: **taxtant** (`G:\マイドライブ\root\taxtant`, Python) が data-drills API を叩いて problem/file を投入。

---

## サービス一覧

| レイヤ | サービス | 役割 | 場所 / プラン | デプロイ | 識別子 |
|---|---|---|---|---|---|
| ホスティング | **Cloudflare Worker** `data-drills-cf` | React SPA + Hono API | CF (account `1b3607a1…`) | **main push で自動** (Workers Builds) / `wrangler deploy` | domain `drills.shibaleo.uk` |
| DB (OLTP) | **Neon PostgreSQL** | トランザクション DB (`data_drills` schema)。`data_meals`/`data_memory` と同居の共有 hub | Neon org `shibaleo`, `aws-us-west-2`, pg17。project `royal-frost-48342064`「shibaleo shared database」 | — (managed) | prod=branch `production` (`br-divine-water-akc8zxbr` / `ep-ancient-band-akmmfep7`)、dev=branch `development` (`br-lingering-voice-akiuw5tx` / `ep-purple-poetry-akddz6av`) |
| DB 接続 | **Cloudflare Hyperdrive** | prod worker → Neon の接続プール | CF | wrangler.toml | binding `HYPERDRIVE` id `10aa89de…` |
| DB (DWH) | **Neon PostgreSQL** (別アカウント) | `data_warehouse`/`data_presentation` (Toggl/Fitbit/Tanita/Zaim)。読み取り専用 | Neon (別ユーザー)。`neon_warehouse` | — | `NEON_DATABASE_URL` (dev/prod 共有) |
| 認証 | **Clerk** | ユーザー認証 (JWT + JWKS) | Clerk app「shibaleo Auth Hub」 | — | Development instance (`pk_test`) / Production instance (`pk_live`)。**user pool は instance ごとに別** |
| PDF export (primary) | **AWS Lambda** `pdf-export` | 選択問題を Drive から DL→PDF 結合 | AWS `ap-northeast-1`, account `417441726386`, arm64, nodejs24.x, 2048MB | **手動 zip** (`services/pdf-lambda` を `node build.mjs` → `aws lambda update-function-code`) | handler `dist/index.handler`。S3 staging `data-drills-pdf-export-shibaleo` (1日で自動削除)。CF→SigV4 (IAM user `cf-worker-pdf`) で Invoke |
| PDF export (fallback) | **Render** `pdf-service` | 同上 (Lambda 5xx/timeout 時) | Render, Singapore, free plan, Docker | git 連携だが **autoDeploy 発火せず→REST/MCP で手動 trigger**。env 変更でも deploy | `srv-d7k658ho3t8c738s0flg`。url `https://pdf-service-r4i7.onrender.com`。Dockerfile `services/pdf-render/Dockerfile` |
| Google (Drive dev) | **GCP** `shibaleo-dev-env` | Drive OAuth + Picker (localhost) | GCP project `360212971049` | — | OAuth client `drills-drive-oauth-dev` / API key `drills-picker-api-key-dev`。Drive API + Picker API 有効 |
| Google (Drive prod) | **GCP** `shibaleo-prod-env` | Drive OAuth + Picker (drills.shibaleo.uk) | GCP project `698047960453` | — | OAuth client `drills-drive-oauth` / API key `drills-picker-api-key` |
| Drive ストレージ | オーナーの **Google Drive** | problem PDF の実体 | — | — | user OAuth token を DB (`oauth_token`) に保持。main app が発行、Lambda/Render が同 client で refresh |
| Secret 管理 | **Bitwarden Secrets Manager** | 実 secret の単一ソース | bws | — | project `shibaleo-dev-secrets` (`6eece948…`) / `shibaleo-prod-secrets` (`16c74c07…`)。`bws run --project-id` で切替。旧 `shibaleo-secrets-hub` (`b49ccb02…`) は温存 |
| 取り込み | **taxtant** (外部 Python) | PDF scan/問題抽出/一括 import | `G:\マイドライブ\root\taxtant` | 手動 | data-drills API Key で `/api/v1/problems` 等を呼ぶ |

---

## Config / secret の置き場所 (原則)

**secret は注入 / 非 secret は全部 git 追跡 / 曖昧な第3を作らない** ([SECRETS.md](../SECRETS.md))。

- **非機密 config** → [src/lib/public-config.ts](../src/lib/public-config.ts) (git 追跡・型付き)。dev/prod を `import.meta.env.PROD` でビルド時分岐 (tree-shake)。
  baseUrl / clerkPublishableKey / googleDriveClientId / googlePickerApiKey / pdfApiUrl。
- **実 secret** → ローカル dev は **bws** (`bws run --project-id <env>` で注入)、prod runtime は **CF Worker Secret**。
  DATABASE_URL / NEON_DATABASE_URL / CLERK_SECRET_KEY / GOOGLE_DRIVE_CLIENT_SECRET / PDF_SERVICE_KEY / AWS_* / PDF_LAMBDA_* 等。
- **bootstrap token** → `.env.local` (gitignore) の `BWS_ACCESS_TOKEN` のみ。
- `.env*` は全 gitignore。export サービス (pdf-core) は別ビルドで public-config.ts を import できないため env 参照 (Render dashboard / Lambda env)。

## デプロイ発火まとめ

| 対象 | 発火 |
|---|---|
| CF Worker | **main への push で自動** (Workers Builds)。または `pnpm deploy` (`wrangler deploy`) |
| Render pdf-service | **手動** (REST `POST /v1/services/{id}/deploys` or MCP `trigger_deploy`)。env 変更でも deploy |
| AWS Lambda pdf-export | **手動** (`cd services/pdf-lambda && node build.mjs` → `aws lambda update-function-code --zip-file fileb://lambda.zip`) |

## 環境分離 (dev / prod)

| | dev | prod |
|---|---|---|
| App URL | `http://localhost:5180` | `https://drills.shibaleo.uk` |
| Neon | `development` ブランチ | `production` ブランチ |
| GCP (Drive) | `shibaleo-dev-env` (360212971049) | `shibaleo-prod-env` (698047960453) |
| Clerk | Development instance (pk_test/sk_test) | Production instance (pk_live/sk_live) |
| bws | `shibaleo-dev-secrets` | `shibaleo-prod-secrets` |
| Google 値の選択 | `import.meta.env.PROD === false` | `=== true` (ビルド時) |

## 廃止済み (2026-07-22 削除)

- GCP `learning-data-488710` (194250744875) — 旧 dev/prod 共用 OAuth client の在処。cutover で新プロジェクトへ移行後に削除。
- GCP `MCPist` (733498587302) — MCP/Apps Script 実験用。data-drills 未使用。
- ※ Neon の旧名「MCPist」(→「shibaleo shared database」に改名) は**現役の prod DB**。上記 GCP MCPist とは別物。
