import { z } from "zod";

export const fieldCreateInputSchema = z.object({
  id: z.string().uuid().optional(),
  code: z.string().min(1).optional(),
  name: z.string().min(1),
  color: z.string().nullish(),
});

export const fieldUpdateInputSchema = z.object({
  code: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  color: z.string().nullish(),
  sort_order: z.number().int().nonnegative().optional(),
});

export type FieldCreateInput = z.infer<typeof fieldCreateInputSchema>;
export type FieldUpdateInput = z.infer<typeof fieldUpdateInputSchema>;

/** Shared schema for subjects / levels (per-field masters) */
export const masterCreateInputSchema = z.object({
  id: z.string().uuid().optional(),
  code: z.string().min(1).optional(),
  name: z.string().min(1),
  color: z.string().nullish(),
  sort_order: z.number().int().nonnegative().optional(),
});

export const masterUpdateInputSchema = z.object({
  code: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  color: z.string().nullish(),
  sort_order: z.number().int().nonnegative().optional(),
});
