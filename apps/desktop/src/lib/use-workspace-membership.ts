import { useQuery } from "@tanstack/react-query";
import { supabase } from "./supabase-client";
import { useAuthStore } from "./auth-store";

export interface WorkspaceMembership {
  workspaceId: string;
  role: "ADMIN" | "MEMBER" | "AGENT";
}

/**
 * Uygulama MVP'de tek workspace varsayar (SPEC.md → F); şema çoklu workspace'e
 * hazır olsa da bu hook kullanıcının ilk üyeliğini döner.
 */
export function useWorkspaceMembership() {
  const userId = useAuthStore((state) => state.session?.user.id);

  return useQuery({
    queryKey: ["workspace-membership", userId],
    enabled: !!userId,
    queryFn: async (): Promise<WorkspaceMembership | null> => {
      const { data, error } = await supabase
        .from("workspace_members")
        .select("workspace_id, role")
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      return { workspaceId: data.workspace_id as string, role: data.role as WorkspaceMembership["role"] };
    },
  });
}
