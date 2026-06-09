import { z } from "zod";

/** Batch reorder body: `{ ids: string[] }` */
export const reorderInputSchema = z.object({
  ids: z.array(z.string().uuid()),
});

/** Query with optional `field_id`. Routes treat undefined as "all user-scoped rows". */
export const fieldIdQuerySchema = z.object({
  field_id: z.string().uuid().optional(),
});
