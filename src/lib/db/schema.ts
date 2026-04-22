import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  primaryKey,
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
// 1. Project
// =============================================================================

export const project = pgTable("project", {
  id: id(),
  code: code(),
  name: name(),
  color: text("color"),
  gdriveFolderId: text("gdrive_folder_id"),
  sortOrder: integer("sort_order").notNull().default(0),
  ...timestamps(),
}, (t) => [
  uniqueIndex("project_code_key").on(t.code),
]);

// =============================================================================
// 2. Subject
// =============================================================================

export const subject = pgTable("subject", {
  id: id(),
  code: code(),
  name: name(),
  projectId: uuid("project_id").notNull().references(() => project.id, { onDelete: "cascade" }),
  color: text("color"),
  sortOrder: integer("sort_order").notNull().default(0),
  ...timestamps(),
}, (t) => [
  uniqueIndex("subject_project_code_key").on(t.projectId, t.code),
]);

// =============================================================================
// 3. Level
// =============================================================================

export const level = pgTable("level", {
  id: id(),
  code: code(),
  name: name(),
  projectId: uuid("project_id").notNull().references(() => project.id, { onDelete: "cascade" }),
  color: text("color"),
  sortOrder: integer("sort_order").notNull().default(0),
  ...timestamps(),
}, (t) => [
  uniqueIndex("level_project_code_key").on(t.projectId, t.code),
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
  code: code(),
  name: name(),
  color: text("color"),
  sortOrder: integer("sort_order").notNull().default(0),
  ...timestamps(),
}, (t) => [
  uniqueIndex("tag_code_key").on(t.code),
]);

// =============================================================================
// 6. AnswerStatus (project-independent)
// =============================================================================

export const answerStatus = pgTable("answer_status", {
  id: id(),
  code: code(),
  name: name(),
  color: text("color"),
  point: integer("point").notNull().default(0),
  sortOrder: integer("sort_order").notNull().default(0),
  stabilityDays: integer("stability_days").notNull().default(0),
  description: text("description"),
  ...timestamps(),
}, (t) => [
  uniqueIndex("answer_status_code_key").on(t.code),
]);

// =============================================================================
// 7. Problem
// =============================================================================

export const problem = pgTable("problem", {
  id: id(),
  code: code(),
  projectId: uuid("project_id").notNull().references(() => project.id, { onDelete: "cascade" }),
  subjectId: uuid("subject_id").references(() => subject.id, { onDelete: "set null" }),
  levelId: uuid("level_id").references(() => level.id, { onDelete: "set null" }),
  topicId: uuid("topic_id").references(() => topic.id, { onDelete: "set null" }),
  name: text("name"),
  checkpoint: text("checkpoint"),
  standardTime: integer("standard_time"),
  ...timestamps(),
}, (t) => [
  uniqueIndex("problem_project_code_key").on(t.projectId, t.code, t.subjectId, t.levelId),
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
  topicId: uuid("topic_id").references(() => topic.id, { onDelete: "set null" }),
  front: text("front").notNull(),
  back: text("back").notNull(),
  ...timestamps(),
}, (t) => [
  uniqueIndex("flashcard_project_code_key").on(t.projectId, t.code),
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
// 16. Note
// =============================================================================

export const note = pgTable("note", {
  id: id(),
  projectId: uuid("project_id").notNull().references(() => project.id, { onDelete: "cascade" }),
  topicId: uuid("topic_id").references(() => topic.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  content: text("content").notNull().default(""),
  pinned: boolean("pinned").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  ...timestamps(),
});

// =============================================================================
// 17. NoteTag (M:N)
// =============================================================================

export const noteTag = pgTable("note_tag", {
  noteId: uuid("note_id").notNull().references(() => note.id, { onDelete: "cascade" }),
  tagId: uuid("tag_id").notNull().references(() => tag.id, { onDelete: "cascade" }),
}, (t) => [
  primaryKey({ columns: [t.noteId, t.tagId] }),
]);

// =============================================================================
// 18. NoteProblem (M:N)
// =============================================================================

export const noteProblem = pgTable("note_problem", {
  noteId: uuid("note_id").notNull().references(() => note.id, { onDelete: "cascade" }),
  problemId: uuid("problem_id").notNull().references(() => problem.id, { onDelete: "cascade" }),
}, (t) => [
  primaryKey({ columns: [t.noteId, t.problemId] }),
]);

// =============================================================================
// 19. User
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
  provider: text("provider").notNull(), // 'google'
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token"),
  tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// =============================================================================
// 23. FilterPref
// =============================================================================

export const filterPref = pgTable("filter_pref", {
  id: id(),
  projectId: uuid("project_id").notNull().references(() => project.id, { onDelete: "cascade" }),
  filters: jsonb("filters").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("filter_pref_project_key").on(t.projectId),
]);
