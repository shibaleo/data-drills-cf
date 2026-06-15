import { z } from "zod";

const cadence = z.enum(["daily", "weekly"]);

export const habitCreateInputSchema = z.object({
  id: z.string().uuid().optional(),
  cadence,
  toggl_project: z.string().min(1),
  toggl_description: z.string().min(1),
  sort_order: z.number().int().nonnegative().optional(),
  is_active: z.boolean().optional(),
});

export const habitUpdateInputSchema = z.object({
  cadence: cadence.optional(),
  toggl_project: z.string().min(1).optional(),
  toggl_description: z.string().min(1).optional(),
  sort_order: z.number().int().nonnegative().optional(),
  is_active: z.boolean().optional(),
});

export type HabitCreateInput = z.infer<typeof habitCreateInputSchema>;
export type HabitUpdateInput = z.infer<typeof habitUpdateInputSchema>;
