import { z } from "zod";

export const tagCreateInputSchema = z.object({
  id: z.string().uuid().optional(),
  code: z.string().min(1).optional(),
  name: z.string().min(1),
  color: z.string().nullish(),
  sort_order: z.number().int().nonnegative().optional(),
});

export const tagUpdateInputSchema = z.object({
  code: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  color: z.string().nullish(),
  sort_order: z.number().int().nonnegative().optional(),
});
