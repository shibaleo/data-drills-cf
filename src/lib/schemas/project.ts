import { z } from "zod";

export const projectCreateInputSchema = z.object({
  id: z.string().uuid().optional(),
  code: z.string().min(1).optional(),
  name: z.string().min(1),
  color: z.string().nullish(),
});

export const projectUpdateInputSchema = z.object({
  code: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  color: z.string().nullish(),
  sort_order: z.number().int().nonnegative().optional(),
});

/** Shared schema for subjects / levels / topics (per-project masters) */
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
