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
// 1. Project
// =============================================================================

export const project = pgTable("project", {
  id: id(),
  userId: uuid("user_id").notNull(),  // FK は user 定義より下なので constraint は SQL 側
  code: code(),
  name: name(),
  color: text("color"),
  gdriveFolderId: text("gdrive_folder_id"),
  sortOrder: integer("sort_order").notNull().default(0),
  ...timestamps(),
}, (t) => [
  uniqueIndex("project_user_code_key").on(t.userId, t.code),
]);

// =============================================================================
// 2. Subject
// =============================================================================

export const subject = pgTable("subject", {
  id: id(),
  code: code(),
  name: name(),
  projectId: uuid("project_id").notNull().references(() => project.id, { onDelete: "cascade" }),
  // Phase 1 追加: 新 owner。Phase 4 で project_id を drop して NOT NULL 化
  fieldId: uuid("field_id"),
  color: text("color"),
  sortOrder: integer("sort_order").notNull().default(0),
  ...timestamps(),
}, (t) => [
  uniqueIndex("subject_project_code_key").on(t.projectId, t.code),
  index("subject_field_idx").on(t.fieldId),
]);

// =============================================================================
// 3. Level
// =============================================================================

export const level = pgTable("level", {
  id: id(),
  code: code(),
  name: name(),
  projectId: uuid("project_id").notNull().references(() => project.id, { onDelete: "cascade" }),
  fieldId: uuid("field_id"),
  color: text("color"),
  sortOrder: integer("sort_order").notNull().default(0),
  ...timestamps(),
}, (t) => [
  uniqueIndex("level_project_code_key").on(t.projectId, t.code),
  index("level_field_idx").on(t.fieldId),
]);

// =============================================================================
// 4. Topic
// =============================================================================

export const topic = pgTable("topic", {
  id: id(),
  code: code(),
  name: name(),
  projectId: uuid("project_id").notNull().references(() => project.id, { onDelete: "cascade" }),
  color: text("color"),
  sortOrder: integer("sort_order").notNull().default(0),
  ...timestamps(),
}, (t) => [
  uniqueIndex("topic_project_code_key").on(t.projectId, t.code),
]);

// =============================================================================
// 5. Tag (project-independent)
// =============================================================================

export const tag = pgTable("tag", {
  id: id(),
  userId: uuid("user_id").notNull(),
  code: code(),
  name: name(),
  color: text("color"),
  sortOrder: integer("sort_order").notNull().default(0),
  ...timestamps(),
}, (t) => [
  uniqueIndex("tag_user_code_key").on(t.userId, t.code),
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
  projectId: uuid("project_id").notNull().references(() => project.id, { onDelete: "cascade" }),
  fieldId: uuid("field_id"),
  subjectId: uuid("subject_id").references(() => subject.id, { onDelete: "set null" }),
  levelId: uuid("level_id").references(() => level.id, { onDelete: "set null" }),
  topicId: uuid("topic_id").references(() => topic.id, { onDelete: "set null" }),
  name: text("name"),
  checkpoint: text("checkpoint"),
  standardTime: integer("standard_time"),
  ...timestamps(),
}, (t) => [
  uniqueIndex("problem_project_code_key").on(t.projectId, t.code, t.subjectId, t.levelId),
  index("problem_field_idx").on(t.fieldId),
]);

// =============================================================================
// 8. ProblemTag (M:N)
// =============================================================================

export const problemTag = pgTable("problem_tag", {
  problemId: uuid("problem_id").notNull().references(() => problem.id, { onDelete: "cascade" }),
  tagId: uuid("tag_id").notNull().references(() => tag.id, { onDelete: "cascade" }),
}, (t) => [
  primaryKey({ columns: [t.problemId, t.tagId] }),
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

export const reviewTag = pgTable("review_tag", {
  reviewId: uuid("review_id").notNull().references(() => review.id, { onDelete: "cascade" }),
  tagId: uuid("tag_id").notNull().references(() => tag.id, { onDelete: "cascade" }),
}, (t) => [
  primaryKey({ columns: [t.reviewId, t.tagId] }),
]);

// =============================================================================
// 12. Flashcard
// =============================================================================

export const flashcard = pgTable("flashcard", {
  id: id(),
  code: code(),
  projectId: uuid("project_id").notNull().references(() => project.id, { onDelete: "cascade" }),
  fieldId: uuid("field_id"),
  topicId: uuid("topic_id").references(() => topic.id, { onDelete: "set null" }),
  front: text("front").notNull(),
  back: text("back").notNull(),
  ...timestamps(),
}, (t) => [
  uniqueIndex("flashcard_project_code_key").on(t.projectId, t.code),
  index("flashcard_field_idx").on(t.fieldId),
]);

// =============================================================================
// 13. FlashcardTag (M:N)
// =============================================================================

export const flashcardTag = pgTable("flashcard_tag", {
  flashcardId: uuid("flashcard_id").notNull().references(() => flashcard.id, { onDelete: "cascade" }),
  tagId: uuid("tag_id").notNull().references(() => tag.id, { onDelete: "cascade" }),
}, (t) => [
  primaryKey({ columns: [t.flashcardId, t.tagId] }),
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

export const filterPref = pgTable("filter_pref", {
  id: id(),
  userId: uuid("user_id").notNull(),
  projectId: uuid("project_id").notNull().references(() => project.id, { onDelete: "cascade" }),
  filters: jsonb("filters").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("filter_pref_user_project_key").on(t.userId, t.projectId),
]);

// =============================================================================
// 24. Backlog (bitemporal append-only)
//
// 新規問題配分の戦略エンティティ。(id, revision) PK。
// 編集時は revision+1 を INSERT し、旧 revision の valid_to に NOW() を塗る。
// archive は is_active=false の新 revision を INSERT。
// メンバー問題は filter から導出する。
// =============================================================================

export type MemberFilter = {
  /** Phase 1 追加: field (旧 project) ID 指定で cross-field 横断選択を表現 */
  fieldIds?: string[];
  subjectIds?: string[];
  levelIds?: string[];
};

export const backlog = pgTable("backlog", {
  id: uuid("id").notNull(),
  revision: integer("revision").notNull(),
  projectId: uuid("project_id").notNull().references(() => project.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  dailyMinutes: integer("daily_minutes").notNull(),
  timeMultiplierPct: integer("time_multiplier_pct").notNull().default(100),
  weekdayWeights: jsonb("weekday_weights").$type<number[]>().notNull().default([1, 1, 1, 1, 1, 1, 1]),
  filter: jsonb("filter").$type<MemberFilter>().notNull().default({}),
  isActive: boolean("is_active").notNull().default(true),
  validFrom: timestamp("valid_from", { withTimezone: true }).notNull().defaultNow(),
  validTo: timestamp("valid_to", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.id, t.revision] }),
  index("backlog_current_idx").on(t.id, t.revision.desc()),
  index("backlog_project_active_idx").on(t.projectId, t.isActive, t.validTo),
]);

// =============================================================================
// 24b. Scope (bitemporal append-only) — Phase 1: 追加のみ
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
  // Phase 1: 旧 backlog_id を残しつつ、scope_id を nullable で追加
  // (Phase 2 で consumer 切替後、Phase 4 で backlog_id を drop)
  backlogId: uuid("backlog_id").notNull(),
  scopeId: uuid("scope_id"),
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
  index("goal_layer_backlog_idx").on(t.backlogId, t.isActive, t.validTo),
  index("goal_layer_scope_idx").on(t.scopeId, t.isActive, t.validTo),
]);

// =============================================================================
// 26. GoalMilestone (bitemporal append-only)
// =============================================================================

export const goalMilestone = pgTable("goal_milestone", {
  id: uuid("id").notNull(),
  revision: integer("revision").notNull(),
  backlogId: uuid("backlog_id").notNull(),
  scopeId: uuid("scope_id"),
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
  index("goal_milestone_backlog_idx").on(t.backlogId, t.isActive, t.validTo),
  index("goal_milestone_scope_idx").on(t.scopeId, t.isActive, t.validTo),
  index("goal_milestone_layer_idx").on(t.layerId),
]);

// =============================================================================
// 27. ReviewScope (bitemporal append-only)
//
// Review チャートの対象問題集合を定義するエンティティ。
// (id, revision) PK。filter 変更 = revision+1 INSERT + 旧 valid_to 塗り。
// archive は is_active=false の新 revision を INSERT。
// =============================================================================

export const reviewScope = pgTable("review_scope", {
  id: uuid("id").notNull(),
  revision: integer("revision").notNull(),
  projectId: uuid("project_id").notNull().references(() => project.id, { onDelete: "cascade" }),
  scopeId: uuid("scope_id"),
  name: text("name").notNull(),
  filter: jsonb("filter").$type<MemberFilter>().notNull().default({}),
  isActive: boolean("is_active").notNull().default(true),
  validFrom: timestamp("valid_from", { withTimezone: true }).notNull().defaultNow(),
  validTo: timestamp("valid_to", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.id, t.revision] }),
  index("review_scope_current_idx").on(t.id, t.revision.desc()),
  index("review_scope_project_active_idx").on(t.projectId, t.isActive, t.validTo),
  index("review_scope_scope_idx").on(t.scopeId),
]);

// =============================================================================
// 28. ThroughputScope (bitemporal append-only)
//
// Throughput チャートの対象問題集合を定義するエンティティ。
// review_scope と同じ shape。
// =============================================================================

export const throughputScope = pgTable("throughput_scope", {
  id: uuid("id").notNull(),
  revision: integer("revision").notNull(),
  projectId: uuid("project_id").notNull().references(() => project.id, { onDelete: "cascade" }),
  scopeId: uuid("scope_id"),
  name: text("name").notNull(),
  filter: jsonb("filter").$type<MemberFilter>().notNull().default({}),
  isActive: boolean("is_active").notNull().default(true),
  validFrom: timestamp("valid_from", { withTimezone: true }).notNull().defaultNow(),
  validTo: timestamp("valid_to", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.id, t.revision] }),
  index("throughput_scope_current_idx").on(t.id, t.revision.desc()),
  index("throughput_scope_project_active_idx").on(t.projectId, t.isActive, t.validTo),
  index("throughput_scope_scope_idx").on(t.scopeId),
]);

// =============================================================================
// 29. StatsScope (bitemporal append-only) — 学習効率インサイト用 scope
// =============================================================================

export const statsScope = pgTable("stats_scope", {
  id: uuid("id").notNull(),
  revision: integer("revision").notNull(),
  projectId: uuid("project_id").notNull().references(() => project.id, { onDelete: "cascade" }),
  scopeId: uuid("scope_id"),
  name: text("name").notNull(),
  filter: jsonb("filter").$type<MemberFilter>().notNull().default({}),
  isActive: boolean("is_active").notNull().default(true),
  validFrom: timestamp("valid_from", { withTimezone: true }).notNull().defaultNow(),
  validTo: timestamp("valid_to", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.id, t.revision] }),
  index("stats_scope_current_idx").on(t.id, t.revision.desc()),
  index("stats_scope_project_active_idx").on(t.projectId, t.isActive, t.validTo),
  index("stats_scope_scope_idx").on(t.scopeId),
]);

export const digestScope = pgTable("digest_scope", {
  id: uuid("id").notNull(),
  revision: integer("revision").notNull(),
  projectId: uuid("project_id").notNull().references(() => project.id, { onDelete: "cascade" }),
  scopeId: uuid("scope_id"),
  name: text("name").notNull(),
  filter: jsonb("filter").$type<MemberFilter>().notNull().default({}),
  isActive: boolean("is_active").notNull().default(true),
  validFrom: timestamp("valid_from", { withTimezone: true }).notNull().defaultNow(),
  validTo: timestamp("valid_to", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.id, t.revision] }),
  index("digest_scope_current_idx").on(t.id, t.revision.desc()),
  index("digest_scope_project_active_idx").on(t.projectId, t.isActive, t.validTo),
  index("digest_scope_scope_idx").on(t.scopeId),
]);
