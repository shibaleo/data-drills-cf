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

対象コード (Google Drive 連携の認証):
- [src/lib/google-oauth.ts](../src/lib/google-oauth.ts) — client_id / client_secret を使う 3 関数
  (getAuthUrl / exchangeCode / getValidAccessToken)。**token を発行**する側
- [src/lib/use-drive-picker.ts](../src/lib/use-drive-picker.ts) — `VITE_GOOGLE_PICKER_API_KEY` を使う Picker
- [services/pdf-core/src/lib/google-oauth.ts](../services/pdf-core/src/lib/google-oauth.ts) — export サービス。
  DB の refresh_token を **同じ Drive OAuth client** で refresh して Drive からファイル DL (pdf-sync.ts の `/export`)

今回のスコープ: **drills の Google 連携のみ**移行。他アプリ (learning-data 等) は対象外。

> **重要 (2026-07-22 判明):** export サービスは main app が発行した refresh_token を使うため、
> **同一の Drive OAuth client (client_id/secret) を共有する 1 credential**。dev/prod 分離時は
> main app 側 (bws) と export サービス側 (Render dashboard env / Lambda env) の両方に **env 別の同一値**を入れる。
> - `oauth_token` テーブルは access/refresh_token + expiry のみ保持し client_id/secret は持たない
>   ([schema](../services/pdf-core/src/lib/db/schema.ts))。refresh 時の client 認証は env 由来なので、
>   env の client が発行元と不一致だと access_token 失効時に `invalid_grant` で壊れる。
> - 現状 committed [services/pdf-render/.env](../services/pdf-render/.env) の client 値は main app と別物
>   (おそらく stale。Render は dashboard env が実行時値)。分離時に main app と同一値へ揃えて解消すること。

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

コードは `env.GOOGLE_DRIVE_CLIENT_SECRET` (dev/prod の印なし) を参照したまま。値は project により変わる。

### 2.5 env var を用途スコープの命名に rename (2026-07-22, 実施済)

汎用の `GOOGLE_*` は「GCP プロジェクト内の 1 クライアント」を暗黙前提しており、用途別に複数 client/key を
最小権限で発行する実態と噛み合わない。GCP project + bws project が**環境**を、クライアント名が**用途**を担う
(直交)。将来 GCal を戻せば `GOOGLE_CALENDAR_*` が並ぶ。今回 Drive 連携を用途スコープ名に統一:

| 旧 | 新 | 実体 |
|---|---|---|
| `GOOGLE_CLIENT_ID` | `GOOGLE_DRIVE_CLIENT_ID` | Drive OAuth client (公開) |
| `GOOGLE_CLIENT_SECRET` | `GOOGLE_DRIVE_CLIENT_SECRET` | Drive OAuth client (秘密) |
| `VITE_GOOGLE_API_KEY` | `VITE_GOOGLE_PICKER_API_KEY` | Picker API 限定キー (名前=制限で最小権限が自明) |

rename 済み: main app コード / pdf-core コード / 全 env ファイル / bws 3 project 全部の secret key /
本 docs / SECRETS.md / CLAUDE.md。値は据え置きで動作不変。Render dashboard の env 名は**ユーザーが手動 rename 必要**。

### 3. Vite `.env.[mode]` に Google 公開値を移す

`VITE_BASE_URL` の dev/prod 分岐 (localhost ↔ drills.shibaleo.uk) が既に確立済みなので、
同じ機構に `GOOGLE_DRIVE_CLIENT_ID` / `VITE_GOOGLE_PICKER_API_KEY` を乗せるだけ。
**新規の public-config `{dev,prod}` 分岐コードは不要** (CLAUDE.md の記述より SECRETS.md の実態が新しい)。

移行後の `.env` 構成:

```
.env             (共通・commit)  → PDF_API_URL のみ。Google 値は抜く
.env.development (dev・commit)   → GOOGLE_DRIVE_CLIENT_ID(dev) + VITE_GOOGLE_PICKER_API_KEY(dev)
.env.production  (prod・commit)  → GOOGLE_DRIVE_CLIENT_ID(prod) + VITE_GOOGLE_PICKER_API_KEY(prod)
bws dev-secrets                  → GOOGLE_DRIVE_CLIENT_SECRET(dev)
bws prod-secrets                 → GOOGLE_DRIVE_CLIENT_SECRET(prod)
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
      GOOGLE_DRIVE_CLIENT_SECRET / PDF_SERVICE_KEY / AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY)
      を両 project にコピー (器の完成。値は当面同一、Google だけ後で別値化)
- [x] env var を用途スコープ名へ rename (§2.5)。コード / env / bws 3 project / docs 完了。**Render dashboard の env 名 rename はユーザー未実施**

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

### B. bws: GOOGLE_DRIVE_CLIENT_SECRET を新値に差し替え + token scoping

- [x] `shibaleo-dev-secrets` の `GOOGLE_DRIVE_CLIENT_SECRET` を **dev env の新 client secret** に更新済
      (2026-07-22。`.env.development` に誤って入っていた client secret を bws へ移送、commit ファイルからは除去)
- [ ] `shibaleo-prod-secrets` の `GOOGLE_DRIVE_CLIENT_SECRET` を **prod env の新 client secret** に更新 (prod credential 発行後)
  - `bws secret edit <secret-id> --value <new>` もしくは Bitwarden Web UI

> **衝突と解決 (2026-07-22):** token が hub / dev-secrets / prod-secrets の 3 project 全部を見えており、同名キーが
> 3 重になるため無指定の `bws run` は `Multiple secrets with name: 'DATABASE_URL'` でエラーになる。
> **解決 = `bws run --project-id <PROJECT_ID>` で読む project を明示するだけ。token は 1 本のまま分けない。**
> - dev: `--project-id 6eece948-709c-4a86-8923-b48e017573b9` (shibaleo-dev-secrets)
> - prod: `--project-id 16c74c07-0fb8-468a-8606-b48e01757644` (shibaleo-prod-secrets)
> - [x] `package.json` の dev / db:* / bootstrap に dev project-id を付与済 (2026-07-22)。
>   実 dev パイプラインで 3 値解決を確認 (ID=72 / PickerKey=39 / Secret=35 桁)。
> - machine account を dev/prod で分ける必要は**ない** (当初案は撤回)。「token で project 切替」でなく
>   「1 token + 実行時 `--project-id` で切替」が正しい理解。

### C. コード: .env の Google 値を .env.[mode] へ移動

- [x] `.env` から `GOOGLE_DRIVE_CLIENT_ID` / `VITE_GOOGLE_PICKER_API_KEY` を削除 (2026-07-22)
- [x] `.env.development` に **dev の値**を配置。dev client secret は bws dev-secrets へ (誤って commit ファイルに入っていたのを移送)
- [ ] `.env.production` に **prod の値** (prod credential 発行後)
- ※ dev では `.env` が先に読まれると旧値が勝つため `.env` から抜くのが必須だった (dotenv-cli は先勝ち)

### G. DB (Neon) の dev/prod 分離 — development ブランチ方式 (2026-07-22, 実施済)

**トポロジ (判明):**
- data-drills の実 prod DB = Neon org `shibaleo` の project **「shibaleo shared database」** (旧名 MCPist, `royal-frost-48342064`)。
  `data_drills` / `data_meals` / `data_memory` の 3 アプリ schema が同居する共有 hub。1334 problems 等の実データ。
  postgresql MCP では `neon_drills` として見える。
- DWH (`NEON_DATABASE_URL`) = **別 Neon アカウント**の `neon_warehouse` (Toggl/Fitbit 等、読み取り専用)。dev も prod もこれを共有、分離不要。
  ※「実データが別ユーザーに」の話はこの DWH のことだった。data-drills 本体は shibaleo org 内にある。

**採用: production ブランチから `development` ブランチを作成 (別 project でなく branch)。**
- dev = branch `development` (`br-lingering-voice-akiuw5tx`, endpoint `ep-purple-poetry-akddz6av`)。prod の CoW 完全複製 (実データ入り)。
- prod = 既定ブランチ `production` (`br-divine-water-akc8zxbr`, endpoint `ep-ancient-band-akmmfep7`)。
- [x] bws **dev-secrets の `DATABASE_URL`** を development ブランチの接続文字列に差し替え。dev パイプラインで host 解決を確認。
- prod-secrets の `DATABASE_URL` は production ブランチのまま。共有 hub 構成は維持 (data_drills を専用 project に切り出さない)。
- トレードオフ: branch は prod と同 project の compute quota を共有する。完全な quota 隔離が要るなら別 project + dump/restore だが、個人利用では branch で十分と判断。
- oauth_token も CoW で複製されるので dev の Drive は再認可不要で動く (複製時点のトークン = dev クライアントのもの)。

> **prod の Drive トークンは要再認可 (既知・保留):** §A の dev 検証中に共有 prod DB の oauth_token を **dev クライアントのトークンで上書き**してしまった
> (client 差し替え時の不可避現象)。prod デプロイ後、prod クライアントで一度再認可すれば production ブランチ側が prod トークンに戻る。dev ブランチは独立。

### D. scripts: prod ビルドの bws 注入経路

- `package.json` の `dev` / `db:*` は `.env.local` token 経由で dev-secrets を読むよう確認
- prod ビルド (`deploy`) は prod-secrets token を使う経路を用意
  - 現状 `deploy` は `pnpm build && wrangler deploy` で bws を通していない。
    prod runtime secret は CF Worker Secret に置く原則なので、
    `GOOGLE_DRIVE_CLIENT_SECRET` (prod) を `wrangler secret put` で設定する経路も検討。
  - どちらを SSOT にするか (bws prod-secrets か CF Worker Secret か) は B の token 設計と合わせて決める。

### D2. deploy 時の env 名付け替え (rename の相方。deploy と同時必須)

> **更新 (2026-07-22): §H で公開値を public-config.ts に移したため、CF 側で扱う Google 値は
> `GOOGLE_DRIVE_CLIENT_SECRET` (秘密) だけになった。** 公開の client_id / picker key は build 焼き込みで
> CF binding 不要。以下は最新の要点 (詳細は ★runbook §4):

- **CF Worker (prod)**: `GOOGLE_DRIVE_CLIENT_SECRET`(prod) を `wrangler secret put`。旧 `GOOGLE_CLIENT_SECRET` /
  旧 `GOOGLE_CLIENT_ID` (もし binding にあれば) を削除。公開値は public-config.ts からビルド焼き込みなので CF binding 不要。
  ※ `wrangler secret list` は `CLOUDFLARE_API_TOKEN` が要る (実確認は dashboard)。
- **Render / Lambda (export サービス)**: pdf-core は別ビルドで public-config.ts を import できないため、
  **env 参照のまま**。dashboard の env 名を `GOOGLE_DRIVE_CLIENT_ID` / `GOOGLE_DRIVE_CLIENT_SECRET` に付け替え
  (値は main app の prod client と同一)。ここは「非機密が env」で第3バケツに見えるが、別サービス境界の制約として許容。

### E. 検証

- dev: `pnpm dev` で Drive ピッカーが dev env の credential で開くか
- prod: `pnpm build` 後の bundle に prod の CLIENT_ID / API_KEY が焼かれているか
- OAuth フロー (認可 → callback → token 交換) が両環境で通るか

### F. docs 更新

- [x] [SECRETS.md](../SECRETS.md): 4 象限 (公開/秘密 × 共有/環境別) の置き場所表に更新、bws dev/prod project 反映
- [x] [CLAUDE.md](../CLAUDE.md): Pending #5 を進行中に、env var 用途スコープ rename を反映
- [ ] 残: Pending #1 Toggl が実質実装済みの棚卸し (別件)

---

## ★ Prod cutover runbook (順序厳守 — commit は最後の引き金)

**現状 (2026-07-22): dev は完全分離で稼働。prod はまだ旧デプロイのまま無事。1〜4追加/6 完了、残 5・7・8 + deploy 後の CF 掃除。**
`main` への commit が CF 自動ビルド/デプロイを引く。commit を先にしない (5 を揃えてから 7)。

- [x] 1. prod Google credential 発行 (`drills-drive-oauth` / `drills-picker-api-key`、project 698047960453)
- [x] 2. public-config.ts の prod 値差し替え (client id / picker key)。build で焼き込み確認済
- [x] 3. bws prod-secrets `GOOGLE_DRIVE_CLIENT_SECRET` = prod client secret
- [x] 4-追加. CF Worker Secret に `GOOGLE_DRIVE_CLIENT_SECRET`(prod) を put 済 (wrangler、token=.env.local)
- [x] 6. bws prod-secrets `CLERK_SECRET_KEY` = sk_live に差し替え済
- [ ] 5. Render/Lambda の export env 名付け替え (下記)
- [ ] 7. commit → deploy
- [ ] 4-削除 (deploy 後). CF Worker の旧 secret を削除: `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` /
      `VITE_CLERK_PUBLISHABLE_KEY` (どれも新コードは読まない = 公開値は焼き込み・secret は新名)。deploy 前に消すと現行 prod が壊れる
- [ ] 8. prod で Drive 再認可 (新 prod クライアント)

1. **prod Google credential 発行** (GCP `shibaleo-prod-env`, 名前は dev と揃える):
   - OAuth client `drills-drive-oauth`: JS 生成元 `https://drills.shibaleo.uk` / redirect `https://drills.shibaleo.uk/api/auth/google/callback`
   - API key `drills-picker-api-key`: Websites referrer `https://drills.shibaleo.uk/*`, API 制限 = Google Picker API
2. **prod 公開値を配置**: [src/lib/public-config.ts](../src/lib/public-config.ts) の `prod` の TODO placeholder
   (`googleDriveClientId` / `googlePickerApiKey`) を実値に差し替え (baseUrl / pk_live / pdfApiUrl は埋め済)。
   **prod ビルドがここから焼くので `.env.production` も CF ビルド変数も不要** (公開値は全部 git 追跡の public-config.ts が単一ソース)。
3. **prod 秘密を配置**: bws prod-secrets の `GOOGLE_DRIVE_CLIENT_SECRET` を prod client secret に (`bws secret edit 2a8b63cc-… --value …`)
4. **CF Worker (prod) の runtime secret 設定** (非機密 binding は不要になった):
   - `GOOGLE_DRIVE_CLIENT_SECRET`(prod) を `wrangler secret put` で設定
   - 旧 `GOOGLE_CLIENT_SECRET` を削除。旧 `GOOGLE_CLIENT_ID` も削除 (公開値は public-config.ts へ移行済 = CF binding 不要)
   - ※ 公開値 (client_id / picker key / clerk pk / baseUrl) は build 焼き込み。CF 側の非機密 [vars]/binding は撤去済
5. **Render / Lambda (export) の env 名付け替え**: dashboard の `GOOGLE_CLIENT_ID/SECRET` → `GOOGLE_DRIVE_CLIENT_ID/SECRET`。
   値は **main app の prod client と同一** (export は同じ Drive client を共有)。
6. **CLERK_SECRET_KEY(prod)**: bws prod-secrets が今 `sk_test_` のまま。prod は `sk_live_` へ差し替え (別件だがここで一緒に)
7. **commit → deploy**。新コードが新 env 名を読み、両側揃っているので prod 継続
8. **prod Drive を新 prod クライアントで再認可** (`https://drills.shibaleo.uk/api/auth/google/`)。
   production ブランチの oauth_token が prod トークンに更新される (dev ブランチは独立で無影響)。

> 補足: prod picker を**今すぐ**直す (cutover 前) 場合は、現デプロイ=旧共用クライアントで再認可すればよい (一時対応)。
> 7 の deploy 後に 8 でもう一度 (新 prod クライアントで) 再認可が要る = **prod 再認可は二段**。

### 未 commit の変更 (この cutover で一緒に入る)
- env var 用途スコープ rename (main app / pdf-core secret 名)
- **公開 config を `src/lib/public-config.ts` へ集約 + `.env*` 全削除** (§H)
- `package.json` (`--project-id` + free-port) / `scripts/free-port.mjs` / `wrangler.toml` / `vite.config.ts` / `vite-env.d.ts`
- `SECRETS.md` / `CLAUDE.md` / 本 docs

**commit = 上記 runbook の 7**（prod 値埋め + CF secret 設定が済むまで commit しない）。

### H. 公開 config を public-config.ts へ (2026-07-22, 実施済)

原則「secret は注入 / 非 secret は全部 git 追跡 / 曖昧な第3を作らない」を最も完全に満たす形として、
`.env.[mode]` (committed file) から **config-as-code** へ移行:

- 新規 [src/lib/public-config.ts](../src/lib/public-config.ts): `dev`/`prod` オブジェクト + `import.meta.env.PROD ? prod : dev`。
  公開値のみ (baseUrl / clerkPublishableKey / googleDriveClientId / googlePickerApiKey / pdfApiUrl)。
- ビルド時分岐で tree-shake: client=Vite、worker=esbuild define ([build-worker.mjs](../scripts/build-worker.mjs))、dev worker=Vite ssrLoadModule。
  → prod bundle には prod 値だけ (検証済: dev picker key 不在 / prod baseUrl・pk_live 在 / worker の dev client id 0 回)。
- consumer を `env.*` / `import.meta.env.VITE_*` から `publicConfig.*` に差し替え (env.ts は secret getter だけ残す)。
- `.env` / `.env.development` / `.env.production` を削除、`.gitignore` で `.env*` 全 ignore。dev script は `dotenv -e .env.local -- bws run …` に簡素化。
- 「以前 `.env.[mode]` で行くと決めた」判断を、原則駆動で意識的に撤回 (安全でなく整理のためでなく、原則を最も満たすため)。
- 副次効果: **cutover の CF ビルド env / `.env.production` が丸ごと不要になった** (runbook §2/§4 参照)。

---

## 補足 / 注意点

- **CLERK_SECRET_KEY が dev/prod 両 project とも `sk_test_` (dev キー)** になっている
  (コピー元の hub が dev 値だったため)。prod デプロイ前に prod-secrets 側を `sk_live_` に
  要差し替え。今回の Google タスクとは別件だが、project 分割のついでに整理すると良い。
- bws のシークレット値は access token にフルアクセス権があれば CLI から読み書き可能
  (今回の token は read/write 両方できることを確認済み)。
- 既存 `shibaleo-secrets-hub` project は当面温存。dev/prod-secrets へ完全移行できたら
  棚卸しして削除を検討。
