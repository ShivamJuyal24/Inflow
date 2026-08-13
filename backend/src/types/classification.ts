import { z } from "zod";

export const EmailCategorySchema = z.enum([
  "SPAM",
  "LOW_PRIORITY",
  "INFORMATIONAL",
  "REQUIRES_REPLY",
  "MEETING",
  "IMPORTANT",
]);

export const LLMEmailClassificationSchema = z.object({
  category: EmailCategorySchema,
  reason: z.string().min(1),
  suggested_action: z.string().min(1),
});

export const EmailClassificationSchema =
  LLMEmailClassificationSchema.extend({
    messageId: z.string().min(1),
  });

export type EmailCategory = z.infer<typeof EmailCategorySchema>;

export type LLMEmailClassification = z.infer<
  typeof LLMEmailClassificationSchema
>;

export type EmailClassification = z.infer<
  typeof EmailClassificationSchema
>;