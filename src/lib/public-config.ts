/**
 * 公開 (非機密) config の単一ソース。dev/prod を分岐し、git 追跡する。
 *
 * 方針 (2026-07-22 確定): 「secret は注入 / 非 secret はすべて git 追跡 / 曖昧な第3を作らない」。
 * ここに置くのは **公開値のみ** — client bundle に焼かれても・リポジトリに commit されても
 * 問題ない値 (publishable key / client ID / API key(referrer 制限) / URL)。
 * **実 secret (client_secret / DB URL / service key 等) は絶対に置かない**。それらは
 * process.env 経由で注入する (ローカル=bws、prod=CF Worker Secret)。詳細は SECRETS.md。
 *
 * dev/prod の選択は `import.meta.env.PROD` (ビルド時定数)。未使用ブランチは tree-shake され、
 * 各 bundle には該当環境の値だけが残る。
 * - client bundle: Vite が置換
 * - worker bundle: esbuild の define (scripts/build-worker.mjs) が置換
 * - dev worker: Vite dev server の ssrLoadModule が解決 (import.meta.env.PROD=false)
 */

interface PublicConfig {
  /** App base URL。OAuth redirect (`/api/auth/google/callback`) 構築に使う。 */
  baseUrl: string;
  /** Clerk Publishable Key (公開)。frontend の ClerkProvider + server の JWKS domain 推定。 */
  clerkPublishableKey: string;
  /** Google Drive OAuth client ID (公開)。main app と export サービスが共有する 1 credential。 */
  googleDriveClientId: string;
  /** Google Picker API key (公開・referrer 制限)。Drive ピッカー用。 */
  googlePickerApiKey: string;
  /** Render の PDF サービス URL (フォールバック経路)。export 機能用。 */
  pdfApiUrl: string;
}

const dev: PublicConfig = {
  baseUrl: "http://localhost:5180",
  clerkPublishableKey: "pk_test_aHVtYmxlLWdydWItODguY2xlcmsuYWNjb3VudHMuZGV2JA",
  googleDriveClientId: "360212971049-iicuf3g7pgoht0eue0hcktl21frgifvq.apps.googleusercontent.com",
  googlePickerApiKey: "AIzaSyBKmaS8dqoQlvIOEN9Ti2QeRPAdfADbGTI",
  pdfApiUrl: "https://pdf-service-r4i7.onrender.com",
};

const prod: PublicConfig = {
  baseUrl: "https://drills.shibaleo.uk",
  clerkPublishableKey: "pk_live_Y2xlcmsuc2hpYmFsZW8udWsk",
  googleDriveClientId: "698047960453-a8eh295gjqu1hcq8dlit1mrk3tpmgrui.apps.googleusercontent.com",
  googlePickerApiKey: "AIzaSyDlK53GjUynNRnLTwQOSRKXZBiS2Eceas4",
  pdfApiUrl: "https://pdf-service-r4i7.onrender.com",
};

export const publicConfig: PublicConfig = import.meta.env.PROD ? prod : dev;
