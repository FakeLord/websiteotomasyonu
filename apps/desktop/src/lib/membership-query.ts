export interface WorkspaceMembership {
  workspaceId: string;
  role: "ADMIN" | "MEMBER" | "AGENT";
}

interface MembershipBuilder {
  eq(column: string, value: string): MembershipBuilder;
  limit(count: number): MembershipBuilder;
  maybeSingle(): PromiseLike<{ data: { workspace_id: unknown; role: unknown } | null; error: unknown }>;
}

/** `supabase` istemcisinin bu sorgu için kullandığı dar yüzey (testte sahtesi verilir). */
export interface MembershipClient {
  from(table: "workspace_members"): { select(columns: string): MembershipBuilder };
}

/**
 * Oturumdaki kullanıcının KENDİ üyeliği. RLS ekibin tüm üye satırlarını görünür kıldığı için `user_id`
 * süzgeci şarttır; yoksa ilk satır (çoğunlukla yönetici) döner ve temsilci yönetici gibi görünür.
 * Uygulama tek workspace varsayar (SPEC.md → F); şema çoklu workspace'e hazırdır.
 */
export async function fetchOwnMembership(client: MembershipClient, userId: string): Promise<WorkspaceMembership | null> {
  const { data, error } = await client
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return { workspaceId: data.workspace_id as string, role: data.role as WorkspaceMembership["role"] };
}
