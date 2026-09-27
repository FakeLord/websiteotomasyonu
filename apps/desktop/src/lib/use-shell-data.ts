import { useQuery } from "@tanstack/react-query";
import { supabase } from "./supabase-client";
import { useAuthStore } from "./auth-store";
import { useWorkspaceMembership } from "./use-workspace-membership";

export interface ShellCounters {
  awaitingReply: number;
  overdueFollowUps: number;
  openHandoffs: number;
}

export function useShellCounters() {
  const workspaceId = useWorkspaceMembership().data?.workspaceId;
  return useQuery({
    queryKey: ["shell-counters", workspaceId],
    enabled: !!workspaceId,
    refetchInterval: 60_000,
    queryFn: async (): Promise<ShellCounters> => {
      const { data, error } = await supabase.rpc("shell_counters", { ws: workspaceId as string });
      if (error) throw error;
      return data as ShellCounters;
    },
  });
}

export function useMyProfile() {
  const userId = useAuthStore((state) => state.session?.user.id);
  const email = useAuthStore((state) => state.session?.user.email);
  const query = useQuery({
    queryKey: ["my-profile", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("full_name").eq("id", userId as string).maybeSingle();
      if (error) throw error;
      return data as { full_name: string | null } | null;
    },
  });
  const rawName = query.data?.full_name?.trim() || email || "";
  // Profil adı hiç girilmemişse (veya e-postayla aynıysa) e-postanın yerel kısmı gösterilir.
  const displayName = rawName.includes("@") ? (rawName.split("@")[0] ?? "") : rawName;
  return { displayName, email: email ?? "", userId };
}

export const TURKISH_CITIES = [
  "İstanbul",
  "Ankara",
  "İzmir",
  "Bursa",
  "Antalya",
  "Kocaeli",
  "Konya",
  "Adana",
  "Gaziantep",
  "Mersin",
  "Kayseri",
  "Eskişehir",
  "Tekirdağ",
  "Muğla",
  "Sakarya",
  "Samsun",
  "Trabzon",
  "Diyarbakır",
] as const;
