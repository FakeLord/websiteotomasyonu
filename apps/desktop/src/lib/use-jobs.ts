import { useQuery } from "@tanstack/react-query";
import { supabase } from "./supabase-client";
import { useScanStore } from "./scan-store";
import { useWorkspaceMembership } from "./use-workspace-membership";

export interface PlacesUsage {
  used: number;
  cap: number | null;
}

export type ScanPlanStatus = "ACTIVE" | "PAUSED" | "BUDGET_PAUSED" | "DONE" | "CANCELLED";

/** `scan_plan_progress` RPC satırı. */
export interface ScanPlanProgress {
  id: string;
  city: string;
  countryCode: string;
  status: ScanPlanStatus;
  language: "tr" | "en";
  createdAt: string;
  categoryCount: number;
  tilesTotal: number;
  tilesFinished: number;
  tilesFailed: number;
  newBusinesses: number;
  apiCalls: number;
  lastError: string | null;
}

const LIVE_REFRESH_MS = 4000;

/** Bu ayki Google Places çağrı sayısı ve sınırı (sunucudaki gerçek sayaç). */
export function usePlacesUsage() {
  const workspaceId = useWorkspaceMembership().data?.workspaceId;
  const scanning = useScanStore((state) => state.scan.running);
  return useQuery({
    queryKey: ["places-usage", workspaceId],
    enabled: !!workspaceId,
    refetchInterval: scanning ? LIVE_REFRESH_MS : false,
    queryFn: async (): Promise<PlacesUsage> => {
      const { data, error } = await supabase.rpc("places_usage_status", { ws: workspaceId as string });
      if (error) throw new Error(error.message);
      return data as PlacesUsage;
    },
  });
}

/** Son tarama planları ve ilerlemeleri. */
export function useScanPlans() {
  const workspaceId = useWorkspaceMembership().data?.workspaceId;
  const scanning = useScanStore((state) => state.scan.running);
  return useQuery({
    queryKey: ["scan-plans", workspaceId],
    enabled: !!workspaceId,
    // Başka bir cihaz tarıyor olabilir: etkin plan varken de tazelenir.
    refetchInterval: (query) =>
      scanning ? LIVE_REFRESH_MS : query.state.data?.some((plan) => plan.status === "ACTIVE") ? 15_000 : false,
    queryFn: async (): Promise<ScanPlanProgress[]> => {
      const { data, error } = await supabase.rpc("scan_plan_progress", { ws: workspaceId as string });
      if (error) throw new Error(error.message);
      return (data ?? []) as ScanPlanProgress[];
    },
  });
}
