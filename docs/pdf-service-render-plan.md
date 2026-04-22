# PDF 処理サービスを Docker on Render にホスト

## Context

CF Workers 版 (data-drills-cf) では PDF 処理ライブラリ (pdfjs-dist, pdf-lib, fontkit) がバンドルサイズ制限で使えないため、現在は Vercel にプロキシしている (`PDF_API_URL=https://data-drills.vercel.app`)。

PDF 処理を独立サービスとして Render (Docker) にデプロイし、CF Worker の `PDF_API_URL` を変更するだけで切り替え可能にする。

## アーキテクチャ

```
CF Worker (data-drills-cf)
  src/routes/pdf-sync.ts (プロキシ — 変更: 認証ヘッダー追加のみ)
    ↓ PDF_API_URL
Render (Docker)
  Hono server (port 3000)
    /api/v1/pdf-sync/scan
    /api/v1/pdf-sync/apply
    /api/v1/pdf-sync/export
    ↓ DB接続
  Supabase PostgreSQL (共有)
```

## ファイル構成

`services/pdf/` をモノレポ内に配置。

```
services/pdf/
├── Dockerfile
├── .dockerignore
├── .env.example             # 必要な環境変数のテンプレート
├── .gitignore               # .env を除外
├── package.json
├── tsconfig.json
├── scripts/
│   └── set-render-env.sh    # Render CLI で環境変数を一括設定
├── src/
│   ├── index.ts              # Hono + @hono/node-server
│   ├── routes/pdf-sync.ts    # data-drills から移植
│   └── lib/
│       ├── pdf-processing.ts # data-drills から移植
│       ├── google-oauth.ts   # data-drills から移植
│       ├── drive-helpers.ts  # data-drills から移植
│       ├── auth.ts           # シンプルな API Key 認証
│       └── db/
│           ├── index.ts      # postgres + drizzle (標準 Node.js)
│           └── schema.ts     # 必要テーブルのみ
└── assets/fonts/yumin.ttf    # 13MB 日本語フォント
```

## 移植元ファイル (data-drills リポジトリ)

| ソース | 変更点 |
|--------|--------|
| `src/routes/pdf-sync.ts` (326行) | import パス変更のみ |
| `src/lib/pdf-processing.ts` (289行) | フォントパスを `assets/fonts/yumin.ttf` に |
| `src/lib/google-oauth.ts` | そのまま |
| `src/lib/drive-helpers.ts` | そのまま |
| `src/lib/db/schema.ts` | 必要テーブルのみ抽出 (project, problem, problemFile, subject, level, oauthToken) |
| `assets/fonts/yumin.ttf` | そのまま |

## 依存パッケージ

```json
{
  "dependencies": {
    "hono": "^4.12.8",
    "@hono/node-server": "^1.14.1",
    "pdfjs-dist": "^5.6.205",
    "pdf-lib": "^1.17.1",
    "@pdf-lib/fontkit": "^1.1.1",
    "googleapis": "^171.4.0",
    "postgres": "^3.4.8",
    "drizzle-orm": "^0.44.7"
  },
  "devDependencies": {
    "esbuild": "^0.28.0",
    "typescript": "^5.9.3",
    "@types/node": "^22.19.15"
  }
}
```

## CF Worker 側の変更 (最小限)

### 1. プロキシに認証ヘッダー追加 (`src/routes/pdf-sync.ts`)

```ts
// Before
headers: c.req.raw.headers,

// After
headers: {
  ...Object.fromEntries(c.req.raw.headers.entries()),
  "x-pdf-service-key": process.env.PDF_SERVICE_KEY || "",
},
```

### 2. 環境変数更新

```bash
echo "https://pdf-service-xxx.onrender.com" | npx wrangler secret put PDF_API_URL
echo "some-random-secret" | npx wrangler secret put PDF_SERVICE_KEY
```

## 環境変数 (すべて `services/pdf/` 内で管理)

### `.env.example` (テンプレート)

```env
DATABASE_URL=postgresql://user:pass@host:5432/db
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
PDF_SERVICE_KEY=your-shared-secret
PORT=3000
```

### `.gitignore` (`services/pdf/.gitignore`)

```
.env
```

### `scripts/set-render-env.sh`

Render CLI (`render-cli`) または Render Dashboard API 経由で `.env` から一括設定するスクリプト。
`services/pdf/.env` を読み込み、Render サービスに環境変数をセット。

```bash
#!/usr/bin/env bash
# Usage: bash services/pdf/scripts/set-render-env.sh <RENDER_SERVICE_ID>
# Requires: RENDER_API_KEY env var
set -euo pipefail
ENV_FILE="$(dirname "$0")/../.env"
SERVICE_ID="${1:?Usage: $0 <RENDER_SERVICE_ID>}"
# .env を読み込んで Render API で設定
```

### Render 環境変数一覧

| 変数 | 説明 |
|------|------|
| `DATABASE_URL` | Supabase PostgreSQL |
| `GOOGLE_CLIENT_ID` | Google OAuth |
| `GOOGLE_CLIENT_SECRET` | Google OAuth |
| `PDF_SERVICE_KEY` | CF Worker からの認証用 |
| `PORT` | サーバーポート (default: 3000) |

## 実装順序

1. `services/pdf/` ディレクトリ・package.json・tsconfig.json・.gitignore 作成
2. `.env.example` 作成 (環境変数テンプレート)
3. data-drills からソースファイルをコピー・import パス調整
4. `src/index.ts` (Hono サーバーエントリ) 作成
5. `src/lib/auth.ts` (API Key 認証ミドルウェア) 作成
6. `src/lib/db/index.ts` (標準 Node.js DB 接続) 作成
7. Dockerfile + .dockerignore 作成
8. ビルドスクリプト (esbuild) 作成
9. `scripts/set-render-env.sh` (Render 環境変数一括設定スクリプト) 作成
10. ローカル Docker ビルド・動作確認
11. CF Worker のプロキシに認証ヘッダー追加
12. Render にデプロイ・環境変数設定
13. `PDF_API_URL` を Render URL に変更
14. PDF scan/apply/export の動作確認

## 検証

```bash
# ローカルテスト
docker build -t pdf-service services/pdf/
docker run -p 3000:3000 --env-file .env pdf-service
curl http://localhost:3000/health

# CF Worker 経由テスト
# PDF Sync ページから scan → apply → export を実行
```
