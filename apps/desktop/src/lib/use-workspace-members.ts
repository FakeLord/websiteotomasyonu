import { useQuery } from "@tanstack/react-query";
import { supabase } from "./supabase-client";
import { useWorkspaceMembership } from "./use-workspace-membership";

export interface WorkspaceMemberEntry {
  user_id: string;
  name: string;
  email: string;
  role: "ADMIN" | "MEMBER" | "AGENT";
  joined_at: string;
  last_sign_in_at: string | null;
  assigned_count: number;
}

export function useWorkspaceMembers() {
  const workspaceId = useWorkspaceMembership().data?.workspaceId;
  const query = useQuery({
    queryKey: ["workspace-members", workspaceId],
    enabled: !!workspaceId,
    staleTime: 60_000,
    queryFn: async (): Promise<WorkspaceMemberEntry[]> => {
      const { data, error } = await supabase.rpc("workspace_member_directory", { ws: workspaceId as string });
      if (error) throw error;
      // Profil adı hiç girilmemişse kayıt tetikleyicisi e-postayı ad olarak yazar.
      return ((data ?? []) as WorkspaceMemberEntry[]).map((m) => ({
        ...m,
        name: m.name.includes("@") ? (m.name.split("@")[0] ?? m.name) : m.name,
      }));
    },
  });
  const byId = new Map((query.data ?? []).map((m) => [m.user_id, m]));
  return { ...query, members: query.data ?? [], byId };
}
