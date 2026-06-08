import { z } from "zod";
import { memberFilterSchema } from "@/lib/schemas/member-filter";

/** scope ごとに status name → stability days を保持 */
export const statusStabilitiesSchema = z.record(z.string(), z.number().int().nonnegative());

export const scopeCreateInputSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1),
  filter: memberFilterSchema.default({}),
  daily_minutes: z.number().int().positive().default(60),
  time_multiplier_pct: z.number().int().positive().default(100),
  weekday_weights: z.array(z.number().nonnegative()).length(7).default([1, 1, 1, 1, 1, 1, 1]),
  status_stabilities: statusStabilitiesSchema.default({}),
});

export const scopeUpdateInputSchema = z.object({
  name: z.string().min(1).optional(),
  filter: memberFilterSchema.optional(),
  daily_minutes: z.number().int().positive().optional(),
  time_multiplier_pct: z.number().int().positive().optional(),
  weekday_weights: z.array(z.number().nonnegative()).length(7).optional(),
  status_stabilities: statusStabilitiesSchema.optional(),
  is_active: z.boolean().optional(),
});

export type ScopeCreateInput = z.infer<typeof scopeCreateInputSchema>;
export type ScopeUpdateInput = z.infer<typeof scopeUpdateInputSchema>;
