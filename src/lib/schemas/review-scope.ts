import { z } from "zod";
import { memberFilterSchema } from "@/lib/schemas/member-filter";

/* ── ReviewScope (bitemporal) ───────────────────────────────── */

export const reviewScopeCreateInputSchema = z.object({
  project_id: z.string().uuid(),
  name: z.string().min(1),
  filter: memberFilterSchema.default({}),
});
export type ReviewScopeCreateInput = z.infer<typeof reviewScopeCreateInputSchema>;

export const reviewScopeUpdateInputSchema = z.object({
  name: z.string().min(1).optional(),
  filter: memberFilterSchema.optional(),
});
export type ReviewScopeUpdateInput = z.infer<typeof reviewScopeUpdateInputSchema>;
