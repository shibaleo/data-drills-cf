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

  /** Clerk Secret Key (server 用)。ユーザー email lookup に使う。 */
  get CLERK_SECRET_KEY(): string | undefined {
    return process.env.CLERK_SECRET_KEY;
  },

  /** PDF サービスとの共有秘密鍵。x-pdf-service-key ヘッダで使う。 */
  get PDF_SERVICE_KEY(): string {
    return process.env.PDF_SERVICE_KEY ?? "";
  },

  /** Google Drive OAuth client secret (Drive 連携専用クライアント)。 */
  get GOOGLE_DRIVE_CLIENT_SECRET(): string {
    const v = process.env.GOOGLE_DRIVE_CLIENT_SECRET;
    if (!v) throw new Error("GOOGLE_DRIVE_CLIENT_SECRET is not set");
    return v;
  },

  /** data-warehouse presentation API origin override (per-env)。未設定なら
   *  config.warehouseApiBaseUrl (prod) を使う。dev で dev worker を叩く時に設定。 */
  get WAREHOUSE_API_BASE_URL(): string | undefined {
    return process.env.WAREHOUSE_API_BASE_URL;
  },

  /** warehouse API の OAuth client_id (private_key_jwt, RFC 7523)。 */
  get DWH_CLIENT_ID(): string {
    const v = process.env.DWH_CLIENT_ID;
    if (!v) throw new Error("DWH_CLIENT_ID is not set");
    return v;
  },

  /** warehouse API 用クライアント秘密鍵 (Ed25519 private JWK, JSON 文字列)。
   *  client_assertion の署名に使う。対応する公開鍵だけが warehouse D1 にある。 */
  get DWH_CLIENT_PRIVATE_JWK(): string {
    const v = process.env.DWH_CLIENT_PRIVATE_JWK;
    if (!v) throw new Error("DWH_CLIENT_PRIVATE_JWK is not set");
    return v;
  },
};
