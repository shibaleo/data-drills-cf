import {
  pgSchema,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  primaryKey,
  uniqueIndex,
  index,
  date,
} from "drizzle-orm/pg-core";

// すべてのテーブルを `data_drills` schema 配下に置く。
// 他ドメイン (Toggl / fitness / 等) との名前空間衝突を避けるため public を使わない。
const ds = pgSchema("data_drills");
const pgTable = ds.table.bind(ds);

// =============================================================================
// Helpers
// =============================================================================

const id = () => uuid("id").primaryKey().defaultRandom();
const code = () => text("code").notNull();
const name = () => text("name").notNull();
const timestamps = () => ({
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// =============================================================================
// 1. Subject (field 配下)
// =============================================================================
//
// Phase 4 で project / topic / tag は廃止。subject/level/problem/flashcard は
// field を直接親に持つ。

export const subject = pgTable("subject", {
  id: id(),
  code: code(),
  name: name(),
  fieldId: uuid("field_id").notNull().references(() => field.id, { onDelete: "cascade" }),
  color: text("color"),
  sortOrder: integer("sort_order").notNull().default(0),
  ...timestamps(),
}, (t) => [
  uniqueIndex("subject_field_code_key").on(t.fieldId, t.code),
]);

// =============================================================================
// 2. Level
// =============================================================================

export const level = pgTable("level", {
  id: id(),
  code: code(),
  name: name(),
  fieldId: uuid("field_id").notNull().references(() => field.id, { onDelete: "cascade" }),
  color: text("color"),
  sortOrder: integer("sort_order").notNull().default(0),
  ...timestamps(),
}, (t) => [
  uniqueIndex("level_field_code_key").on(t.fieldId, t.code),
]);

// =============================================================================
// 6. AnswerStatus (project-independent)
// =============================================================================

export const answerStatus = pgTable("answer_status", {
  id: id(),
  userId: uuid("user_id").notNull(),
  code: code(),
  name: name(),
  color: text("color"),
  point: integer("point").notNull().default(0),
  sortOrder: integer("sort_order").notNull().default(0),
  stabilityDays: integer("stability_days").notNull().default(0),
  description: text("description"),
  ...timestamps(),
}, (t) => [
  uniqueIndex("answer_status_user_code_key").on(t.userId, t.code),
]);

// =============================================================================
// 7. Problem
// =============================================================================

export const problem = pgTable("problem", {
  id: id(),
  code: code(),
  fieldId: uuid("field_id").notNull().references(() => field.id, { onDelete: "cascade" }),
  subjectId: uuid("subject_id").references(() => subject.id, { onDelete: "set null" }),
  levelId: uuid("level_id").references(() => level.id, { onDelete: "set null" }),
  name: text("name"),
  checkpoint: text("checkpoint"),
  standardTime: integer("standard_time"),
  ...timestamps(),
}, (t) => [
  uniqueIndex("problem_field_code_key").on(t.fieldId, t.code, t.subjectId, t.levelId),
]);

// =============================================================================
// 9. ProblemFile
// =============================================================================

export const problemFile = pgTable("problem_file", {
  id: id(),
  problemId: uuid("problem_id").notNull().references(() => problem.id, { onDelete: "cascade" }),
  gdriveFileId: text("gdrive_file_id").notNull(),
  fileName: text("file_name"),
  problemPages: jsonb("problem_pages").$type<number[]>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// =============================================================================
// 10. Answer
// =============================================================================

export const answer = pgTable("answer", {
  id: id(),
  problemId: uuid("problem_id").notNull().references(() => problem.id, { onDelete: "cascade" }),
  date: timestamp("date", { withTimezone: true }).notNull(),
  duration: integer("duration"),
  answerStatusId: uuid("answer_status_id").references(() => answerStatus.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// =============================================================================
// 11. Review
// =============================================================================

export const review = pgTable("review", {
  id: id(),
  answerId: uuid("answer_id").notNull().references(() => answer.id, { onDelete: "cascade" }),
  content: text("content"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// =============================================================================
// 11b. ReviewTag (M:N)
// =============================================================================

// Phase 6: column 名も review_type_id に rename 済 (option C 解消)
export const reviewTag = pgTable("review_tag", {
  reviewId: uuid("review_id").notNull().references(() => review.id, { onDelete: "cascade" }),
  reviewTypeId: uuid("review_type_id").notNull().references(() => reviewType.id, { onDelete: "cascade" }),
}, (t) => [
  primaryKey({ columns: [t.reviewId, t.reviewTypeId] }),
]);

// =============================================================================
// 12. Flashcard
// =============================================================================

export const flashcard = pgTable("flashcard", {
  id: id(),
  code: code(),
  fieldId: uuid("field_id").notNull().references(() => field.id, { onDelete: "cascade" }),
  front: text("front").notNull(),
  back: text("back").notNull(),
  ...timestamps(),
}, (t) => [
  uniqueIndex("flashcard_field_code_key").on(t.fieldId, t.code),
]);

// =============================================================================
// 13. FlashcardTag (M:N) — Phase 6: column 名も review_type_id に rename 済
// =============================================================================

export const flashcardTag = pgTable("flashcard_tag", {
  flashcardId: uuid("flashcard_id").notNull().references(() => flashcard.id, { onDelete: "cascade" }),
  reviewTypeId: uuid("review_type_id").notNull().references(() => reviewType.id, { onDelete: "cascade" }),
}, (t) => [
  primaryKey({ columns: [t.flashcardId, t.reviewTypeId] }),
]);

// =============================================================================
// 14. FlashcardProblem (M:N)
// =============================================================================

export const flashcardProblem = pgTable("flashcard_problem", {
  flashcardId: uuid("flashcard_id").notNull().references(() => flashcard.id, { onDelete: "cascade" }),
  problemId: uuid("problem_id").notNull().references(() => problem.id, { onDelete: "cascade" }),
}, (t) => [
  primaryKey({ columns: [t.flashcardId, t.problemId] }),
]);

// =============================================================================
// 15. FlashcardReview
// =============================================================================

export const flashcardReview = pgTable("flashcard_review", {
  id: id(),
  flashcardId: uuid("flashcard_id").notNull().references(() => flashcard.id, { onDelete: "cascade" }),
  quality: integer("quality").notNull(), // 1-5
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }).notNull(),
  nextReviewAt: timestamp("next_review_at", { withTimezone: true }),
});

// =============================================================================
// 16. User
// =============================================================================

export const user = pgTable("user", {
  id: id(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  externalId: text("external_id"),       // Clerk user ID (optional)
  isActive: boolean("is_active").notNull().default(true),
  ...timestamps(),
}, (t) => [
  uniqueIndex("user_email_key").on(t.email),
]);

// =============================================================================
// 20. UserCredential
// =============================================================================

export const userCredential = pgTable("user_credential", {
  userId: uuid("user_id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  passwordHash: text("password_hash").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// =============================================================================
// 21. ApiKey
// =============================================================================

export const apiKey = pgTable("api_key", {
  id: id(),
  userId: uuid("user_id").notNull(),
  name: text("name").notNull(),
  keyHash: text("key_hash").notNull(),
  keyPrefix: text("key_prefix").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// =============================================================================
// 22. OAuthToken
// =============================================================================

export const oauthToken = pgTable("oauth_token", {
  id: id(),
  userId: uuid("user_id").notNull(),
  provider: text("provider").notNull(), // 'google'
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token"),
  tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("oauth_token_user_provider_key").on(t.userId, t.provider),
]);

// =============================================================================
// 23. FilterPref
// =============================================================================

// Phase 7: scope_id 単位に変更 (旧 field_id)。同 field 内の複数 scope を
// 別々の UI prefs で扱える。scope は bitemporal append-only なので FK 制約は
// 付けない (goal_layer / goal_milestone と同じ方針)。
export const filterPref = pgTable("filter_pref", {
  id: id(),
  userId: uuid("user_id").notNull(),
  scopeId: uuid("scope_id").notNull(),
  filters: jsonb("filters").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("filter_pref_user_scope_key").on(t.userId, t.scopeId),
]);

// =============================================================================
// 24. MemberFilter (scope の問題集合定義)
// =============================================================================

export type MemberFilter = {
  /** field ID 指定で cross-field 横断選択を表現 */
  fieldIds?: string[];
  subjectIds?: string[];
  levelIds?: string[];
};

// =============================================================================
// 24b. Scope (bitemporal append-only)
//
// 各ページ (Review/Plan/Throughput/Stats/Digest) で共有される
// 「メンバー集合 + スケジューリング設定 + FSRS パラメタ + 目標」のマスターエンティティ。
// user 所有 (cross-field 横断可)。旧 backlog / *_scope を段階的に吸収予定。
// Phase 1 では追加のみで既存は無触。
// =============================================================================

/** scope ごとに status name → stability days (=次回 review までの基準日数) を持つ */
export type StatusStabilities = Record<string, number>;

export const scope = pgTable("scope", {
  id: uuid("id").notNull(),
  revision: integer("revision").notNull(),
  userId: uuid("user_id").notNull(),
  name: text("name").notNull(),
  filter: jsonb("filter").$type<MemberFilter>().notNull().default({}),
  // スケジューリング (旧 backlog から移植)
  dailyMinutes: integer("daily_minutes").notNull().default(60),
  timeMultiplierPct: integer("time_multiplier_pct").notNull().default(100),
  weekdayWeights: jsonb("weekday_weights").$type<number[]>().notNull().default([1, 1, 1, 1, 1, 1, 1]),
  // FSRS 風: status name → stability days のマップ。空なら answer_status global を使う
  statusStabilities: jsonb("status_stabilities").$type<StatusStabilities>().notNull().default({}),
  isActive: boolean("is_active").notNull().default(true),
  validFrom: timestamp("valid_from", { withTimezone: true }).notNull().defaultNow(),
  validTo: timestamp("valid_to", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.id, t.revision] }),
  index("scope_current_idx").on(t.id, t.revision.desc()),
  index("scope_user_active_idx").on(t.userId, t.isActive, t.validTo),
]);

// =============================================================================
// 24c. Field (= 旧 project の新名前、user 所有) — Phase 1: 追加のみ
//
// 「学問領域」を表す永続エンティティ。project から code/name/color 等をコピー。
// Phase 4 で project テーブルは廃止される。
// =============================================================================

export const field = pgTable("field", {
  id: id(),
  userId: uuid("user_id").notNull(),
  code: code(),
  name: name(),
  color: text("color"),
  gdriveFolderId: text("gdrive_folder_id"),
  sortOrder: integer("sort_order").notNull().default(0),
  ...timestamps(),
}, (t) => [
  uniqueIndex("field_user_code_key").on(t.userId, t.code),
]);

// =============================================================================
// 24d. ReviewType (= 旧 tag の新名前、user 所有) — Phase 1: 追加のみ
//
// 「review 評価種別」(不理解 / 理解 etc) のマスター。
// Phase 4 で tag / problem_tag は廃止、review_tag は review_type_id 参照に書き換え。
// =============================================================================

export const reviewType = pgTable("review_type", {
  id: id(),
  userId: uuid("user_id").notNull(),
  code: code(),
  name: name(),
  color: text("color"),
  sortOrder: integer("sort_order").notNull().default(0),
  ...timestamps(),
}, (t) => [
  uniqueIndex("review_type_user_code_key").on(t.userId, t.code),
]);

// =============================================================================
// 25. GoalLayer (bitemporal append-only)
// =============================================================================

export const goalLayer = pgTable("goal_layer", {
  id: uuid("id").notNull(),
  revision: integer("revision").notNull(),
  scopeId: uuid("scope_id").notNull(),
  name: text("name").notNull().default(""),
  color: text("color"),
  opacityPct: integer("opacity_pct"),
  lineStyle: text("line_style"),
  lineWidth: integer("line_width"),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  validFrom: timestamp("valid_from", { withTimezone: true }).notNull().defaultNow(),
  validTo: timestamp("valid_to", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.id, t.revision] }),
  index("goal_layer_current_idx").on(t.id, t.revision.desc()),
  index("goal_layer_scope_idx").on(t.scopeId, t.isActive, t.validTo),
]);

// =============================================================================
// 26. GoalMilestone (bitemporal append-only)
// =============================================================================

export const goalMilestone = pgTable("goal_milestone", {
  id: uuid("id").notNull(),
  revision: integer("revision").notNull(),
  scopeId: uuid("scope_id").notNull(),
  layerId: uuid("layer_id").notNull(),
  target: integer("target").notNull(),
  date: date("date").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  validFrom: timestamp("valid_from", { withTimezone: true }).notNull().defaultNow(),
  validTo: timestamp("valid_to", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.id, t.revision] }),
  index("goal_milestone_current_idx").on(t.id, t.revision.desc()),
  index("goal_milestone_scope_idx").on(t.scopeId, t.isActive, t.validTo),
  index("goal_milestone_layer_idx").on(t.layerId),
]);

// Note: 旧 review_scope / throughput_scope / stats_scope / digest_scope は Plan A
// Step 5 (drizzle/manual/007_phase7_drop_view_scopes.sql) で drop 済。Phase 4 から
// canonical scope.id 直結に統一されており、view-scope テーブルは informational のみ
// だったので落とせる。

// =============================================================================
// 27. Habit (recurrent habits、Toggl 由来 done 判定で /habits ページに表示)
// =============================================================================
//
// done セルは別 table に materialize せず、warehouse の
// `neon_warehouse.data_presentation.fct_toggl_time_entries` を Worker が JOIN
// する。habit 側は「定義」と「Toggl マッチルール」のみ持つ。
//
// マッチルール: (toggl_project, toggl_description) の完全一致タプル。Toggl の
// description は canonical な文字列 (例 "brush teeth") なので regex は不要。

export const habit = pgTable("habit", {
  id: id(),
  userId: uuid("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull(),                          // "Brush teeth" 等
  cadence: text("cadence").notNull(),                    // 'daily' | 'weekly'
  togglProject: text("toggl_project").notNull(),         // Toggl project_name
  togglDescription: text("toggl_description").notNull(), // Toggl description
  categoryColor: text("category_color").notNull(),       // "#06b6d4" 等
  minutesEstimate: integer("minutes_estimate").notNull().default(5),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  ...timestamps(),
}, (t) => [
  // 同一マッチルールの重複登録を防ぐ (同一 user 内)
  uniqueIndex("habit_user_match_key").on(t.userId, t.togglProject, t.togglDescription),
  // /habits の active 一覧クエリ高速化
  index("habit_user_active_idx").on(t.userId, t.isActive),
]);
