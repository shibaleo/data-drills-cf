import { z } from "zod";

/** Batch reorder body: `{ ids: string[] }` */
export const reorderInputSchema = z.object({
  ids: z.array(z.string().uuid()),
});

/** Query with required `project_id` */
export const projectIdQuerySchema = z.object({
  project_id: z.string().uuid(),
});
