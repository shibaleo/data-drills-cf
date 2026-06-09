import { z } from "zod";
import { memberFilterSchema } from "@/lib/schemas/member-filter";

/* ── ReviewScope (bitemporal) ───────────────────────────────── */

export const reviewScopeCreateInputSchema = z.object({
  field_id: z.string().uuid(),
  name: z.string().min(1),
  filter: memberFilterSchema.default({}),
});
export type ReviewScopeCreateInput = z.infer<typeof reviewScopeCreateInputSchema>;

export const reviewScopeUpdateInputSchema = z.object({
  name: z.string().min(1).optional(),
  filter: memberFilterSchema.optional(),
  scope_id: z.string().uuid().nullable().optional(),
});
export type ReviewScopeUpdateInput = z.infer<typeof reviewScopeUpdateInputSchema>;
