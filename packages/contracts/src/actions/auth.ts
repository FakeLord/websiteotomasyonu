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
