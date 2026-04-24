import { z } from "zod";

export const apiKeyCreateInputSchema = z.object({
  name: z.string().min(1),
});
