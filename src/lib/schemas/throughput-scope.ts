import { z } from "zod";
import { memberFilterSchema } from "@/lib/schemas/member-filter";

export const throughputScopeCreateInputSchema = z.object({
  project_id: z.string().uuid(),
  name: z.string().min(1),
  filter: memberFilterSchema.default({}),
});
export type ThroughputScopeCreateInput = z.infer<typeof throughputScopeCreateInputSchema>;

export const throughputScopeUpdateInputSchema = z.object({
  name: z.string().min(1).optional(),
  filter: memberFilterSchema.optional(),
});
export type ThroughputScopeUpdateInput = z.infer<typeof throughputScopeUpdateInputSchema>;
