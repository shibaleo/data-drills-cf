import { z } from "zod";

/** Batch reorder body: `{ ids: string[] }` */
export const reorderInputSchema = z.object({
  ids: z.array(z.string().uuid()),
});

/** Query with required `field_id` */
export const fieldIdQuerySchema = z.object({
  field_id: z.string().uuid(),
});
