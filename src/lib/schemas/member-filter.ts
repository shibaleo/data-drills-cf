import { z } from "zod";

/**
 * Member filter — defines the membership of a backlog or review_scope.
 * Pure data shape, shared across entities.
 */
export const memberFilterSchema = z.object({
  fieldIds: z.array(z.string().uuid()).optional(),
  subjectIds: z.array(z.string().uuid()).optional(),
  levelIds: z.array(z.string().uuid()).optional(),
});
export type MemberFilterInput = z.infer<typeof memberFilterSchema>;
