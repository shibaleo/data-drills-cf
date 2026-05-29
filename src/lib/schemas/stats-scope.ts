import { z } from "zod";
import { memberFilterSchema } from "@/lib/schemas/member-filter";

export const statsScopeCreateInputSchema = z.object({
  project_id: z.string().uuid(),
  name: z.string().min(1),
  filter: memberFilterSchema.default({}),
});
export type StatsScopeCreateInput = z.infer<typeof statsScopeCreateInputSchema>;

export const statsScopeUpdateInputSchema = z.object({
  name: z.string().min(1).optional(),
  filter: memberFilterSchema.optional(),
});
export type StatsScopeUpdateInput = z.infer<typeof statsScopeUpdateInputSchema>;
