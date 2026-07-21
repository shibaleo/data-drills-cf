# GCP dev/prod リソース分離 — 進捗と今後の方針

CLAUDE.md Pending Development #5 の作業ログ。Google Cloud / Google Drive 連携の
credential を dev (localhost) と prod (drills.shibaleo.uk) で分離する。

最終更新: 2026-07-22

---

## ゴール

- Google OAuth client ID / API key / client secret を dev / prod で分離
- 理想形: **GCP プロジェクト自体を dev/prod 分割**し、quota・OAuth 同意画面・監視を isolation
- コードは環境非依存を維持 (キー名に dev/prod を埋めない = アンチパターン回避)。
  環境差は**注入層** (Vite `.env.[mode]` + bws project 選択) が担う。

対象コード (Google Drive ピッカー連携の認証):
- [src/lib/google-oauth.ts](../src/lib/google-oauth.ts) — client_id / client_secret を使う 3 関数
  (getAuthUrl / exchangeCode / getValidAccessToken)
- [src/lib/use-drive-picker.ts](../src/lib/use-drive-picker.ts) — `VITE_GOOGLE_API_KEY` を使う Picker

今回のスコープ: **drills の Google 連携のみ**移行。他アプリ (learning-data 等) は対象外。

---

## 決定事項 (設計)

### 1. GCP プロジェクトは環境ごとに分割

drills 単体でなく、アカウント全体の dev/prod 区分として括る:

| プロジェクト名 | project ID | 用途 |
|---|---|---|
| `shibaleo dev env` | `shibaleo-dev-env` / 360212971049 | dev (localhost) の全アプリ |
| `shibaleo prod env` | `shibaleo-prod-env` / 698047960453 | prod の全アプリ |

- 既存 `learning-data-488710` に drills の**現行 (dev/prod 共用)** OAuth client がある。今回は温存 (後で棚卸し)。
- 同意画面は両 env とも **External + 公開 (published)**。`drive` はセンシティブスコープだが
  個人利用のためテストユーザー運用でも可 (審査不要)。

### 2. bws (Bitwarden Secrets Manager) は project を dev/prod 分割 (C 案)

「キー名に環境を埋めない・コードは無印参照」を満たす 12-Factor 的な正攻法。
**どの project を開くかは access token で決まる** (machine account に project 単位でアクセス付与)。

| bws project | project ID | 誰が読むか |
|---|---|---|
| `shibaleo-secrets-hub` (既存) | `b49ccb02-f02b-4c7e-a4c1-b48e005732fc` | ※旧。移行後は dev/prod に集約予定 |
| `shibaleo-dev-secrets` (新) | `6eece948-709c-4a86-8923-b48e017573b9` | ローカル dev の `.env.local` token |
| `shibaleo-prod-secrets` (新) | `16c74c07-0fb8-468a-8606-b48e01757644` | prod ビルド / CI の token |

コードは `env.GOOGLE_CLIENT_SECRET` (無印) を参照したまま。値は project により変わる。

### 3. Vite `.env.[mode]` に Google 公開値を移す

`VITE_BASE_URL` の dev/prod 分岐 (localhost ↔ drills.shibaleo.uk) が既に確立済みなので、
同じ機構に `GOOGLE_CLIENT_ID` / `VITE_GOOGLE_API_KEY` を乗せるだけ。
**新規の public-config `{dev,prod}` 分岐コードは不要** (CLAUDE.md の記述より SECRETS.md の実態が新しい)。

移行後の `.env` 構成:

```
.env             (共通・commit)  → PDF_API_URL のみ。Google 値は抜く
.env.development (dev・commit)   → GOOGLE_CLIENT_ID(dev) + VITE_GOOGLE_API_KEY(dev)
.env.production  (prod・commit)  → GOOGLE_CLIENT_ID(prod) + VITE_GOOGLE_API_KEY(prod)
bws dev-secrets                  → GOOGLE_CLIENT_SECRET(dev)
bws prod-secrets                 → GOOGLE_CLIENT_SECRET(prod)
```

---

## 完了済み

- [x] GCP プロジェクト `shibaleo dev env` / `shibaleo prod env` 作成
- [x] dev env: Drive API + Picker API 有効化、OAuth 同意画面 (External, published)、テストユーザー登録
- [x] bws CLI (`bitwarden-secrets-manager-cli` 2.1.0) を scoop で導入
      ※ Bash ツールからは `export PATH="$HOME/scoop/shims:$PATH"` が必要。
        PowerShell からは直接 `bws` が使える。
- [x] BWS 経由の本番ビルド動作確認 (`dotenv -e .env -e .env.production -e .env.local -- bws run -- pnpm build` で成功)
- [x] bws project `shibaleo-dev-secrets` / `shibaleo-prod-secrets` を作成
- [x] 既存 hub の 7 キー (DATABASE_URL / NEON_DATABASE_URL / CLERK_SECRET_KEY /
      GOOGLE_CLIENT_SECRET / PDF_SERVICE_KEY / AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY)
      を両 project にコピー (器の完成。値は当面同一、Google だけ後で別値化)

---

## 残タスク (次セッションの再開ポイント)

### A. GCP: OAuth client + API key の発行 (ユーザー作業)

**dev env で先に実施 → 動作確認 → prod env で繰り返す** 順が安全。

dev env (`shibaleo-dev-env`) の認証情報画面:
https://console.cloud.google.com/apis/credentials?project=shibaleo-dev-env

1. **OAuth 2.0 クライアント ID** (ウェブアプリ)
   - 承認済み JavaScript 生成元: `http://localhost:5180`
   - 承認済みリダイレクト URI: `http://localhost:5180/api/auth/google/callback`
   - → **client ID (公開値)** と **client secret (秘密)** を控える
2. **API キー**
   - アプリケーションの制限: HTTP リファラー `http://localhost:5180/*`
   - API の制限: Google Picker API
   - → **API キー (公開値)** を控える

prod env (`shibaleo-prod-env`) では origin/URI を `https://drills.shibaleo.uk` 系に:
- JavaScript 生成元: `https://drills.shibaleo.uk`
- リダイレクト URI: `https://drills.shibaleo.uk/api/auth/google/callback`
- API キー リファラー: `https://drills.shibaleo.uk/*`

参考 (drills が使う設定):
- OAuth スコープ: `https://www.googleapis.com/auth/drive` ([google-oauth.ts:6](../src/lib/google-oauth.ts#L6))
- redirect URI パス: `/api/auth/google/callback` ([google-oauth.ts:9](../src/lib/google-oauth.ts#L9))

### B. bws: GOOGLE_CLIENT_SECRET を新値に差し替え + token 発行

- `shibaleo-dev-secrets` の `GOOGLE_CLIENT_SECRET` を **dev env の新 client secret** に更新
- `shibaleo-prod-secrets` の `GOOGLE_CLIENT_SECRET` を **prod env の新 client secret** に更新
  - `bws secret edit <secret-id> --value <new>` もしくは Bitwarden Web UI
- **machine account を dev/prod 用に分け、それぞれの project へのアクセスを付与**して
  access token を 2 本発行する (これが「token で project が切り替わる」仕組みの肝)。
  - ローカル dev の `.env.local` → dev-secrets を指す token
  - prod (CF Worker / CI) → prod-secrets を指す token
  - ※ 現状の `.env.local` の token は旧 `shibaleo-secrets-hub` を指している。
    dev-secrets へアクセス付与するか、新 token に差し替える必要あり。

### C. コード: .env の Google 値を .env.[mode] へ移動

- `.env` から `GOOGLE_CLIENT_ID` / `VITE_GOOGLE_API_KEY` を削除
- `.env.development` に dev の値、`.env.production` に prod の値を追加
- **新 credential 到着後にまとめて実施** (現行値のまま移すと dev/prod 同一のままなので意味がない)

### D. scripts: prod ビルドの bws 注入経路

- `package.json` の `dev` / `db:*` は `.env.local` token 経由で dev-secrets を読むよう確認
- prod ビルド (`deploy`) は prod-secrets token を使う経路を用意
  - 現状 `deploy` は `pnpm build && wrangler deploy` で bws を通していない。
    prod runtime secret は CF Worker Secret に置く原則なので、
    `GOOGLE_CLIENT_SECRET` (prod) を `wrangler secret put` で設定する経路も検討。
  - どちらを SSOT にするか (bws prod-secrets か CF Worker Secret か) は B の token 設計と合わせて決める。

### E. 検証

- dev: `pnpm dev` で Drive ピッカーが dev env の credential で開くか
- prod: `pnpm build` 後の bundle に prod の CLIENT_ID / API_KEY が焼かれているか
- OAuth フロー (認可 → callback → token 交換) が両環境で通るか

### F. docs 更新

- [SECRETS.md](../SECRETS.md): bws project が dev/prod に分かれたことを反映
  (現状は単一 `shibaleo-secrets-hub` 前提の記述)
- [CLAUDE.md](../CLAUDE.md): Pending #5 を「進行中」に。
  「public-config を `{dev,prod}` 分岐へ」の記述は実態 (Vite `.env.[mode]` で完結) に修正。
  あわせて Pending #1 Toggl が実質実装済みである点も棚卸し対象。

---

## 補足 / 注意点

- **CLERK_SECRET_KEY が dev/prod 両 project とも `sk_test_` (dev キー)** になっている
  (コピー元の hub が dev 値だったため)。prod デプロイ前に prod-secrets 側を `sk_live_` に
  要差し替え。今回の Google タスクとは別件だが、project 分割のついでに整理すると良い。
- bws のシークレット値は access token にフルアクセス権があれば CLI から読み書き可能
  (今回の token は read/write 両方できることを確認済み)。
- 既存 `shibaleo-secrets-hub` project は当面温存。dev/prod-secrets へ完全移行できたら
  棚卸しして削除を検討。
