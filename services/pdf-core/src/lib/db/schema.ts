/**
 * services/pdf は cf-worker から事前に解決された payload (items: gdrive_file_id +
 * pages + label) を受け取って PDF merge するだけ。
 *
 * data-drills の問題情報 schema (problem / subject / level / problem_file 等) には
 * 一切触らないので、それらの定義はここに置かない (= schema drift が物理的に発生
 * しない)。残るのは Google Drive 認証用の oauth_token のみ。
 */
import {
  pgSchema,
  uuid,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

const ds = pgSchema("data_drills");
const pgTable = ds.table.bind(ds);

const id = () => uuid("id").primaryKey().defaultRandom();

// =============================================================================
// OAuthToken (Google Drive credentials)
// =============================================================================

export const oauthToken = pgTable("oauth_token", {
  id: id(),
  provider: text("provider").notNull(),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token"),
  tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
