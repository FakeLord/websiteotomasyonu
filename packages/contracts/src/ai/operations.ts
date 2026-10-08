import { z } from "zod";

/**
 * J.2 bölümündeki 6 AI operasyonunun çıktı şemaları. Model yalnızca bu
 * şemalara uyan JSON döner; uymazsa `validateDraft`/orkestrasyon katmanı bir
 * kez yeniden dener, sonra insan görevine düşer (SPEC.md → J.3).
 */

export const aiIntentSchema = z.enum([
  "INTERESTED",
  "NOT_INTERESTED",
  "QUESTION",
  "STOP_CONTACT",
  "UNCLEAR",
  "OTHER",
  // SPEC.md → L: otomatik yanıt, yanlış kişi/işletme, zaten sağlayıcısı var.
  "AUTO_REPLY",
  "WRONG_CONTACT",
  "ALREADY_HAS_PROVIDER",
]);
export type AiIntent = z.infer<typeof aiIntentSchema>;

export const draftFirstMessageOutputSchema = z.object({
  subject: z.string().trim().max(200).optional(),
  body: z.string().trim().min(1),
  /** Eski taslaklarda vardı; hiçbir yerde kullanılmadığı için artık istenmiyor (daha kısa çıktı = daha hızlı). */
  used_facts: z.array(z.string()).optional(),
});
export type DraftFirstMessageOutput = z.infer<typeof draftFirstMessageOutputSchema>;

/** Taslağın Türkçe çevirisi: ayrı, arka plan çağrısı; ekip anlasın diye gösterilir, gönderilmez. */
export const translateDraftOutputSchema = z.object({
  translation_tr: z.string().trim().min(1),
  subject_tr: z.string().trim().max(300).optional(),
});
export type TranslateDraftOutput = z.infer<typeof translateDraftOutputSchema>;

export const classifyReplyOutputSchema = z.object({
  intent: aiIntentSchema,
  confidence: z.number().min(0).max(1),
  requirements_delta: z.array(z.string()),
  stop_request: z.boolean(),
  language: z.string().trim().min(2).max(10),
});
export type ClassifyReplyOutput = z.infer<typeof classifyReplyOutputSchema>;

export const draftReplyOutputSchema = z.object({
  body: z.string().trim().min(1),
  used_kb_ids: z.array(z.string()),
  proposes_handoff: z.boolean(),
  questions_for_human: z.array(z.string()),
});
export type DraftReplyOutput = z.infer<typeof draftReplyOutputSchema>;

export const updateSummaryOutputSchema = z.object({
  summary: z.string().trim().min(1),
  requirements: z.array(z.string()),
  interest_level: z.enum(["LOW", "MEDIUM", "HIGH"]),
});
export type UpdateSummaryOutput = z.infer<typeof updateSummaryOutputSchema>;

export const generateHandoffOutputSchema = z.object({
  title: z.string().trim().min(1),
  interest: z.string().trim().min(1),
  features: z.array(z.string()),
  budget: z.string().trim().optional(),
  timeline: z.string().trim().optional(),
  price_discussed: z.boolean(),
  open_questions: z.array(z.string()),
  recommended_package_id: z.string().uuid().optional(),
});
export type GenerateHandoffOutput = z.infer<typeof generateHandoffOutputSchema>;

export const followupDraftOutputSchema = z.object({
  body: z.string().trim().min(1),
});
export type FollowupDraftOutput = z.infer<typeof followupDraftOutputSchema>;
