import { z } from "zod";

export const statusCreateInputSchema = z.object({
  id: z.string().uuid().optional(),
  code: z.string().min(1).optional(),
  name: z.string().min(1),
  color: z.string().nullish(),
  point: z.number().int().optional(),
  sort_order: z.number().int().nonnegative().optional(),
  stability_days: z.number().int().nonnegative().optional(),
  description: z.string().nullish(),
});

export const statusUpdateInputSchema = z.object({
  code: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  color: z.string().nullish(),
  point: z.number().int().optional(),
  sort_order: z.number().int().nonnegative().optional(),
  stability_days: z.number().int().nonnegative().optional(),
  description: z.string().nullish(),
});
