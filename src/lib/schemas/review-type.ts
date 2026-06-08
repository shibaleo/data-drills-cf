import { z } from "zod";

export const reviewTypeCreateInputSchema = z.object({
  id: z.string().uuid().optional(),
  code: z.string().min(1).optional(),
  name: z.string().min(1),
  color: z.string().nullish(),
  sort_order: z.number().int().nonnegative().optional(),
});

export const reviewTypeUpdateInputSchema = z.object({
  code: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  color: z.string().nullish(),
  sort_order: z.number().int().nonnegative().optional(),
});

export type ReviewTypeCreateInput = z.infer<typeof reviewTypeCreateInputSchema>;
export type ReviewTypeUpdateInput = z.infer<typeof reviewTypeUpdateInputSchema>;
