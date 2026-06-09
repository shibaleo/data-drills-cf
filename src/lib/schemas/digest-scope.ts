import { z } from "zod";
import { memberFilterSchema } from "@/lib/schemas/member-filter";

export const digestScopeCreateInputSchema = z.object({
  field_id: z.string().uuid(),
  name: z.string().min(1),
  filter: memberFilterSchema.default({}),
});
export type DigestScopeCreateInput = z.infer<typeof digestScopeCreateInputSchema>;

export const digestScopeUpdateInputSchema = z.object({
  name: z.string().min(1).optional(),
  filter: memberFilterSchema.optional(),
  scope_id: z.string().uuid().nullable().optional(),
});
export type DigestScopeUpdateInput = z.infer<typeof digestScopeUpdateInputSchema>;
