import { useQuery } from "@tanstack/react-query";
import { supabase } from "./supabase-client";
import { useAuthStore } from "./auth-store";
import { fetchOwnMembership, type MembershipClient, type WorkspaceMembership } from "./membership-query";

export type { WorkspaceMembership };

// supabase-js sorgu türleri dar arayüze doğrudan atanınca TS2589 verir; arayüz yalnızca bu sorgunun kullandığı yüzeydir.
const membershipClient = supabase as unknown as MembershipClient;

export function useWorkspaceMembership() {
  const userId = useAuthStore((state) => state.session?.user.id);

  return useQuery({
    queryKey: ["workspace-membership", userId],
    enabled: !!userId,
    queryFn: (): Promise<WorkspaceMembership | null> => fetchOwnMembership(membershipClient, userId as string),
  });
}
