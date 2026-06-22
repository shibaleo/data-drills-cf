import { z } from "zod";

const cadence = z.enum(["daily", "weekly"]);

const pattern = z.string().min(1).refine((p) => {
  try { new RegExp(p, "i"); return true; } catch { return false; }
}, "invalid regex");

const patterns = z.array(pattern).min(1, "at least one pattern is required");

export const habitCreateInputSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1),
  cadence,
  toggl_description_patterns: patterns,
  sort_order: z.number().int().nonnegative().optional(),
  is_active: z.boolean().optional(),
});

export const habitUpdateInputSchema = z.object({
  name: z.string().min(1).optional(),
  cadence: cadence.optional(),
  toggl_description_patterns: patterns.optional(),
  sort_order: z.number().int().nonnegative().optional(),
  is_active: z.boolean().optional(),
});

export type HabitCreateInput = z.infer<typeof habitCreateInputSchema>;
export type HabitUpdateInput = z.infer<typeof habitUpdateInputSchema>;
