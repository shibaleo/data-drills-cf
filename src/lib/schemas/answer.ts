import { z } from "zod";

export const answerCreateInputSchema = z.object({
  id: z.string().uuid().optional(),
  problem_id: z.string().uuid(),
  date: z.string(),
  duration: z.number().int().nonnegative().nullish(),
  answer_status_id: z.string().uuid().nullish(),
});

export const answerUpdateInputSchema = z.object({
  date: z.string().optional(),
  duration: z.number().int().nonnegative().nullish(),
  answer_status_id: z.string().uuid().nullish(),
});
