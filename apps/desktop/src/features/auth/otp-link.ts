import { otpLinkTypeSchema, type OtpLinkType } from "@lbf/contracts";

export interface OtpLink {
  tokenHash: string;
  type: OtpLinkType;
}

/**
 * Davet/sıfırlama e-postasındaki bağlantıdan (`#/set-password?token_hash=…&type=…`)
 * tek kullanımlık belirteci okur. Hash router `location.search` değerini verir.
 */
export function parseOtpLink(search: string): OtpLink | null {
  const params = new URLSearchParams(search);
  const tokenHash = params.get("token_hash")?.trim();
  const type = otpLinkTypeSchema.safeParse(params.get("type"));
  if (!tokenHash || !type.success) return null;
  return { tokenHash, type: type.data };
}
