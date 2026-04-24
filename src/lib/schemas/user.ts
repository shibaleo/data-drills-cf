import { z } from "zod";

export const userCreateInputSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
});

export const userUpdateInputSchema = z.object({
  name: z.string().min(1),
});

export const userPasswordInputSchema = z.object({
  password: z.string().min(4),
});

export const loginInputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
