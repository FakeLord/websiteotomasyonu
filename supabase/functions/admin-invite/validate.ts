export const WORKSPACE_ROLES = ["ADMIN", "MEMBER", "AGENT"] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

export interface AdminInviteBody {
  workspaceId: string;
  email: string;
  role: WorkspaceRole;
}

export function isValidBody(value: unknown): value is AdminInviteBody {
  if (typeof value !== "object" || value === null) return false;
  const body = value as Record<string, unknown>;
  return (
    typeof body.workspaceId === "string" &&
    body.workspaceId.length > 0 &&
    typeof body.email === "string" &&
    body.email.includes("@") &&
    typeof body.role === "string" &&
    (WORKSPACE_ROLES as readonly string[]).includes(body.role)
  );
}

export function generateInviteCode(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
