import { z } from "zod";

const cadence = z.enum(["daily", "weekly"]);

export const habitCreateInputSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1),
  cadence,
  toggl_project: z.string().min(1),
  toggl_description: z.string().min(1),
  category_color: z.string().min(1),
  minutes_estimate: z.number().int().positive().optional(),
  sort_order: z.number().int().nonnegative().optional(),
  is_active: z.boolean().optional(),
});

export const habitUpdateInputSchema = z.object({
  name: z.string().min(1).optional(),
  cadence: cadence.optional(),
  toggl_project: z.string().min(1).optional(),
  toggl_description: z.string().min(1).optional(),
  category_color: z.string().min(1).optional(),
  minutes_estimate: z.number().int().positive().optional(),
  sort_order: z.number().int().nonnegative().optional(),
  is_active: z.boolean().optional(),
});

export type HabitCreateInput = z.infer<typeof habitCreateInputSchema>;
export type HabitUpdateInput = z.infer<typeof habitUpdateInputSchema>;
