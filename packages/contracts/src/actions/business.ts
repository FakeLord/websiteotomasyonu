import { z } from "zod";

export const businessSourceSchema = z.enum(["GOOGLE_PLACES", "META_ADS", "GOOGLE_ADS", "MANUAL", "IMPORT"]);
export type BusinessSource = z.infer<typeof businessSourceSchema>;

export const businessStageSchema = z.enum([
  "NEW",
  "QUALIFIED",
  "OUTREACH_READY",
  "CONTACTED",
  "REPLIED",
  "ENGAGED",
  "PROPOSAL_READY",
  "HANDED_OFF",
  "WON",
  "DISQUALIFIED",
  "LOST",
]);
export type BusinessStageValue = z.infer<typeof businessStageSchema>;

/**
 * `import_business()` RPC'sinin girdi sözleşmesi (SPEC.md → G.4). CSV import
 * sihirbazı ve manuel ekleme formu bu şemayı paylaşır (`source` alanı ayırır).
 */
export const importBusinessInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  category: z.string().trim().max(120).optional(),
  address: z.string().trim().max(300).optional(),
  city: z.string().trim().max(120).optional(),
  district: z.string().trim().max(120).optional(),
  /** ISO-3166-1 alpha-2, büyük harf. Verilmezse sunucu `workspace_settings.default_country` kullanır. */
  countryCode: z.string().regex(/^[A-Z]{2}$/).optional(),
  region: z.string().trim().max(120).optional(),
  postalCode: z.string().trim().max(20).optional(),
  /** IANA saat dilimi (ör. America/Chicago). */
  timezone: z.string().trim().regex(/^(UTC|[A-Za-z_]+(\/[A-Za-z0-9_+-]+)+)$/).max(64).optional(),
  /** BCP-47 (ör. en, en-US, tr). */
  language: z.string().trim().regex(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/).max(35).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  googlePlaceId: z.string().trim().max(200).optional(),
  websiteUrl: z.string().trim().url().optional(),
  websiteDomain: z.string().trim().max(255).optional(),
  phoneE164: z.string().trim().max(20).optional(),
  email: z.string().trim().email().optional(),
  instagram: z.string().trim().max(200).optional(),
  facebook: z.string().trim().max(200).optional(),
  source: businessSourceSchema,
  externalId: z.string().trim().max(200).optional(),
  sourceUrl: z.string().trim().url().optional(),
});
export type ImportBusinessInput = z.infer<typeof importBusinessInputSchema>;

export const importBusinessResultSchema = z.object({
  businessId: z.string().uuid(),
  status: z.enum(["CREATED", "POSSIBLE_DUPLICATE", "DUPLICATE_MERGED"]),
});
export type ImportBusinessResult = z.infer<typeof importBusinessResultSchema>;

export const transitionStageInputSchema = z.object({
  businessId: z.string().uuid(),
  toStage: businessStageSchema,
  reason: z.string().trim().max(500).optional(),
  expectedVersion: z.number().int().positive(),
});
export type TransitionStageInput = z.infer<typeof transitionStageInputSchema>;

export const setDncInputSchema = z.object({
  businessId: z.string().uuid(),
  value: z.boolean(),
  reason: z.string().trim().max(500).optional(),
});
export type SetDncInput = z.infer<typeof setDncInputSchema>;

export const mergeBusinessesInputSchema = z.object({
  keepId: z.string().uuid(),
  dropId: z.string().uuid(),
});
export type MergeBusinessesInput = z.infer<typeof mergeBusinessesInputSchema>;

export const addNoteInputSchema = z.object({
  businessId: z.string().uuid(),
  body: z.string().trim().min(1).max(4000),
});
export type AddNoteInput = z.infer<typeof addNoteInputSchema>;
