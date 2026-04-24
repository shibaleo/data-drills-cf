import { z } from "zod";

export const noteCreateInputSchema = z.object({
  project_id: z.string().uuid(),
  topic_id: z.string().uuid().nullish(),
  title: z.string().min(1),
  content: z.string().optional(),
  pinned: z.boolean().optional(),
  sort_order: z.number().int().nonnegative().optional(),
});

export const noteUpdateInputSchema = z.object({
  title: z.string().min(1).optional(),
  content: z.string().optional(),
  topic_id: z.string().uuid().nullish(),
  pinned: z.boolean().optional(),
  sort_order: z.number().int().nonnegative().optional(),
});
export type NoteUpdateInput = z.infer<typeof noteUpdateInputSchema>;

export const noteTagCreateInputSchema = z.object({
  tag_id: z.string().uuid(),
});

export const noteProblemCreateInputSchema = z.object({
  problem_id: z.string().uuid(),
});
