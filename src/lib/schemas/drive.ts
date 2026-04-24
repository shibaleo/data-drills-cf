import { z } from "zod";

export const driveLinkInputSchema = z.object({
  problemId: z.string().uuid(),
  gdriveFileId: z.string().min(1),
  fileName: z.string(),
});
