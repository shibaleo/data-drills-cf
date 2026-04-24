import { z } from "zod";

export const flashcardCreateInputSchema = z.object({
  id: z.string().uuid().optional(),
  code: z.string().min(1).optional(),
  project_id: z.string().uuid(),
  topic_id: z.string().uuid().nullish(),
  front: z.string().min(1),
  back: z.string().min(1),
});

export const flashcardUpdateInputSchema = z.object({
  front: z.string().min(1).optional(),
  back: z.string().min(1).optional(),
  topic_id: z.string().uuid().nullish(),
});
export type FlashcardCreateInput = z.infer<typeof flashcardCreateInputSchema>;
export type FlashcardUpdateInput = z.infer<typeof flashcardUpdateInputSchema>;

export const flashcardTagCreateInputSchema = z.object({
  tag_id: z.string().uuid(),
});

export const flashcardProblemCreateInputSchema = z.object({
  problem_id: z.string().uuid(),
});

export const flashcardReviewCreateInputSchema = z.object({
  id: z.string().uuid().optional(),
  quality: z.number().int().min(0).max(5),
  reviewed_at: z.string().optional(),
  next_review_at: z.string().nullish(),
});
