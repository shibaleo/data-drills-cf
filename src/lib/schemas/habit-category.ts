import { z } from "zod";

export const habitCategoryCreateInputSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1),
  sort_order: z.number().int().nonnegative().optional(),
});

export const habitCategoryUpdateInputSchema = z.object({
  name: z.string().min(1).optional(),
  sort_order: z.number().int().nonnegative().optional(),
});

export type HabitCategoryCreateInput = z.infer<typeof habitCategoryCreateInputSchema>;
export type HabitCategoryUpdateInput = z.infer<typeof habitCategoryUpdateInputSchema>;
