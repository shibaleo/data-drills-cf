/**
 * 環境変数の集中アクセスポイント。
 *
 * 直接 `process.env.X` を呼ばずにここを参照する。
 * - 型情報がフロー (undefined の可能性が分かる)
 * - 全環境変数の一覧が 1 ファイルに集約
 * - 起動時バリデーション (将来 zod 化が容易)
 *
 * CF Workers では process.env はリクエスト毎にバインディングから注入される。
 * モジュールロード時の早期 throw を避け、各 getter で参照する。
 */

export const env = {
  /** Neon PostgreSQL (data_drills schema) の OLTP 接続文字列。Drizzle / postgres-js が読む。 */
  get DATABASE_URL(): string {
    const v = process.env.DATABASE_URL;
    if (!v) throw new Error("DATABASE_URL is not set");
    return v;
  },

  /** Clerk Publishable Key (frontend 用)。Clerk JWKS domain 推定にも使う。 */
  get VITE_CLERK_PUBLISHABLE_KEY(): string | undefined {
    return process.env.VITE_CLERK_PUBLISHABLE_KEY;
  },

  /** Clerk Secret Key (server 用)。ユーザー email lookup に使う。 */
  get CLERK_SECRET_KEY(): string | undefined {
    return process.env.CLERK_SECRET_KEY;
  },

  /** Render の PDF サービス URL。export 機能用。 */
  get PDF_API_URL(): string | undefined {
    return process.env.PDF_API_URL;
  },

  /** PDF サービスとの共有秘密鍵。x-pdf-service-key ヘッダで使う。 */
  get PDF_SERVICE_KEY(): string {
    return process.env.PDF_SERVICE_KEY ?? "";
  },

  /** Google OAuth client ID (Drive 連携)。 */
  get GOOGLE_CLIENT_ID(): string {
    const v = process.env.GOOGLE_CLIENT_ID;
    if (!v) throw new Error("GOOGLE_CLIENT_ID is not set");
    return v;
  },

  /** Google OAuth client secret。 */
  get GOOGLE_CLIENT_SECRET(): string {
    const v = process.env.GOOGLE_CLIENT_SECRET;
    if (!v) throw new Error("GOOGLE_CLIENT_SECRET is not set");
    return v;
  },

  /** App の base URL。OAuth redirect 構築に使う。 */
  get BASE_URL(): string {
    return process.env.VITE_BASE_URL ?? "http://localhost:3000";
  },

  /** Neon DWH 接続文字列 (read-only)。Toggl time entries 等の DWH view を引く用途。 */
  get NEON_DATABASE_URL(): string | undefined {
    return process.env.NEON_DATABASE_URL;
  },
};
