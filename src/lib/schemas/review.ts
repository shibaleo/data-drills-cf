import { z } from "zod";

export const reviewCreateInputSchema = z.object({
  id: z.string().uuid().optional(),
  answer_id: z.string().uuid(),
  content: z.string().nullish(),
});

export const reviewUpdateInputSchema = z.object({
  content: z.string().nullish(),
});

export const reviewTagCreateInputSchema = z.object({
  review_type_id: z.string().uuid(),
});
