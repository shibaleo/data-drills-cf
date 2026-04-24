import { z } from "zod";
import { createSelectSchema } from "drizzle-zod";
import { problem } from "@/lib/db/schema";

/**
 * DB row shape (camelCase, matches Drizzle column names).
 * Use this when you need a runtime schema for a selected row.
 */
export const problemRowSchema = createSelectSchema(problem);
export type ProblemRow = z.infer<typeof problemRowSchema>;

/**
 * API input schemas (snake_case, matching wire format).
 * The API layer accepts snake_case; handlers map to camelCase for Drizzle.
 */
export const problemCreateInputSchema = z.object({
  id: z.string().uuid().optional(),
  code: z.string().min(1).optional(),
  project_id: z.string().uuid(),
  subject_id: z.string().uuid().nullish(),
  level_id: z.string().uuid().nullish(),
  topic_id: z.string().uuid().nullish(),
  name: z.string().nullish(),
  checkpoint: z.string().nullish(),
  standard_time: z.number().int().nonnegative().nullish(),
});
export type ProblemCreateInput = z.infer<typeof problemCreateInputSchema>;

export const problemUpdateInputSchema = z.object({
  code: z.string().min(1).optional(),
  name: z.string().nullish(),
  checkpoint: z.string().nullish(),
  subject_id: z.string().uuid().nullish(),
  level_id: z.string().uuid().nullish(),
  topic_id: z.string().uuid().nullish(),
  standard_time: z.number().int().nonnegative().nullish(),
});
export type ProblemUpdateInput = z.infer<typeof problemUpdateInputSchema>;

export const problemTagCreateInputSchema = z.object({
  tag_id: z.string().uuid(),
});

export const problemFileCreateInputSchema = z.object({
  id: z.string().uuid().optional(),
  gdrive_file_id: z.string().min(1),
  file_name: z.string().nullish(),
});
