// admin-create-user: saf yardımcılar (Deno testi: validate.test.ts).
export const WORKSPACE_ROLES = ["ADMIN", "MEMBER", "AGENT"] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 128;

export interface CreateUserBody {
  workspaceId: string;
  email: string;
  role: WorkspaceRole;
  fullName?: string;
  /** Boşsa sunucu güçlü bir şifre üretir ve yanıtta bir kez döner. */
  password?: string;
}

const EMAIL_RE = /^[^\s@<>"',;:]+@[^\s@<>"',;:]+\.[^\s@<>"',;:]+$/;

export function isValidBody(value: unknown): value is CreateUserBody {
  if (typeof value !== "object" || value === null) return false;
  const b = value as Record<string, unknown>;
  if (typeof b.workspaceId !== "string" || b.workspaceId.length === 0) return false;
  if (typeof b.email !== "string" || !EMAIL_RE.test(b.email) || b.email.length > 254) return false;
  if (typeof b.role !== "string" || !(WORKSPACE_ROLES as readonly string[]).includes(b.role)) return false;
  if (b.fullName !== undefined && (typeof b.fullName !== "string" || b.fullName.length > 120)) return false;
  if (b.password !== undefined && b.password !== "") {
    if (typeof b.password !== "string") return false;
    if (b.password.length < MIN_PASSWORD_LENGTH || b.password.length > MAX_PASSWORD_LENGTH) return false;
  }
  return true;
}

/** Karışabilen karakterler (0/O, 1/l/I) olmadan 16 karakterlik rastgele şifre. */
export function generatePassword(length = 16): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const max = Math.floor(256 / alphabet.length) * alphabet.length;
  const out: string[] = [];
  while (out.length < length) {
    const bytes = new Uint8Array(length * 2);
    crypto.getRandomValues(bytes);
    for (const byte of bytes) {
      if (byte < max && out.length < length) out.push(alphabet[byte % alphabet.length] as string);
    }
  }
  return out.join("");
}
