import { z } from "zod";
import type { ReviewType } from "@/lib/types";

/** Review-type strings narrowed to the ReviewType union (runtime: any string). */
const reviewTypeSchema = z.custom<ReviewType>((v) => typeof v === "string");

/** Client-side form schema for the answer create/edit dialog. */
export const answerFormSchema = z.object({
  subject: z.string().min(1, "科目を選択してください"),
  level: z.string().min(1, "レベルを選択してください"),
  code: z.string().trim().min(1, "コードを入力してください"),
  duration: z
    .string()
    .refine((v) => v === "" || /^\d{1,2}:\d{2}:\d{2}$/.test(v), "HH:MM:SS 形式で入力してください"),
  status: z.string().min(1),
  reviews: z.array(
    z.object({
      id: z.string().optional(),
      _key: z.string().optional(),
      type: reviewTypeSchema,
      content: z.string(),
    }),
  ),
});

export type AnswerFormData = z.infer<typeof answerFormSchema>;
