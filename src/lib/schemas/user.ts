import { z } from "zod";

export const userCreateInputSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
});

export const userUpdateInputSchema = z.object({
  name: z.string().min(1),
});
