import { z } from "zod";

export const driveLinkInputSchema = z.object({
  problemId: z.string().uuid(),
  gdriveFileId: z.string().min(1),
  fileName: z.string(),
  /** 0-indexed page numbers to keep when exporting this problem. */
  problemPages: z.array(z.number().int().nonnegative()).nullish(),
});
