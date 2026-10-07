import { z } from "zod";

export const loginInputSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginInputSchema>;

export const requestPasswordResetInputSchema = z.object({
  email: z.string().trim().email(),
});
export type RequestPasswordResetInput = z.infer<typeof requestPasswordResetInputSchema>;

/** Davet ve şifre sıfırlama e-postalarındaki bağlantı türleri (supabase/templates/*). */
export const otpLinkTypeSchema = z.enum(["invite", "recovery"]);
export type OtpLinkType = z.infer<typeof otpLinkTypeSchema>;

/** SPEC.md → F: minimum şifre uzunluğu 12. */
export const MIN_PASSWORD_LENGTH = 12;

export const setPasswordInputSchema = z
  .object({
    password: z.string().min(MIN_PASSWORD_LENGTH).max(128),
    confirm: z.string(),
  })
  .refine((value) => value.password === value.confirm, { path: ["confirm"], message: "PASSWORD_MISMATCH" });
export type SetPasswordInput = z.infer<typeof setPasswordInputSchema>;

export const acceptInviteInputSchema = z.object({
  inviteCode: z.string().trim().min(1),
});
export type AcceptInviteInput = z.infer<typeof acceptInviteInputSchema>;

export const workspaceRoleSchema = z.enum(["ADMIN", "MEMBER", "AGENT"]);
export type WorkspaceRole = z.infer<typeof workspaceRoleSchema>;

/**
 * `admin-invite` Edge Function'ının girdi sözleşmesi (SPEC.md → F, O).
 * Jarvis manifestinin gelecekteki kaynağı olan `packages/contracts/src/actions/`
 * altındaki ilk gerçek action şeması.
 */
export const adminInviteInputSchema = z.object({
  email: z.string().trim().email(),
  role: workspaceRoleSchema,
});
export type AdminInviteInput = z.infer<typeof adminInviteInputSchema>;

export const adminInviteOutputSchema = z.object({
  inviteId: z.string().uuid(),
  inviteCode: z.string(),
  expiresAt: z.string(),
});
export type AdminInviteOutput = z.infer<typeof adminInviteOutputSchema>;
