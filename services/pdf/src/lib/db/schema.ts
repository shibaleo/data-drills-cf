import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  jsonb,
  uniqueIndex,
} from "drizzle-orm/pg-core";

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
// Subject (only `id` and `name` read by /export for label rendering)
// =============================================================================

export const subject = pgTable("subject", {
  id: id(),
  code: code(),
  name: name(),
  projectId: uuid("project_id").notNull(),
  color: text("color"),
  sortOrder: integer("sort_order").notNull().default(0),
  ...timestamps(),
}, (t) => [
  uniqueIndex("subject_project_code_key").on(t.projectId, t.code),
]);

// =============================================================================
// Level (only `id` and `name` read by /export for label rendering)
// =============================================================================

export const level = pgTable("level", {
  id: id(),
  code: code(),
  name: name(),
  projectId: uuid("project_id").notNull(),
  color: text("color"),
  sortOrder: integer("sort_order").notNull().default(0),
  ...timestamps(),
}, (t) => [
  uniqueIndex("level_project_code_key").on(t.projectId, t.code),
]);

// =============================================================================
// Problem
// =============================================================================

export const problem = pgTable("problem", {
  id: id(),
  code: code(),
  projectId: uuid("project_id").notNull(),
  subjectId: uuid("subject_id").references(() => subject.id, { onDelete: "set null" }),
  levelId: uuid("level_id").references(() => level.id, { onDelete: "set null" }),
  topicId: uuid("topic_id"),
  name: text("name"),
  checkpoint: text("checkpoint"),
  standardTime: integer("standard_time"),
  ...timestamps(),
}, (t) => [
  uniqueIndex("problem_project_code_key").on(t.projectId, t.code, t.subjectId, t.levelId),
]);

// =============================================================================
// ProblemFile
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
// OAuthToken
// =============================================================================

export const oauthToken = pgTable("oauth_token", {
  id: id(),
  provider: text("provider").notNull(),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token"),
  tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
