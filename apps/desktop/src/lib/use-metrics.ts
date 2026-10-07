import { useQuery } from "@tanstack/react-query";
import { supabase } from "./supabase-client";
import { useWorkspaceMembership } from "./use-workspace-membership";
import { STAGE_GROUPS, countForGroup } from "./stage-groups";
import { useMarket } from "./use-market";
import { OTHER_COLOR, SEGMENT_COLORS, type DonutSegment } from "../components/charts/charts";

export interface PeriodCounts {
  found: number;
  sent: number;
  replied: number;
  engaged: number;
  proposal: number;
  won: number;
}

export interface DashboardMetrics {
  days: number;
  series: Array<PeriodCounts & { day: string }>;
  current: PeriodCounts;
  previous: PeriodCounts;
  stageCounts: Record<string, number>;
  totalBusinesses: number;
}

export function useDashboardMetrics(days: number) {
  const workspaceId = useWorkspaceMembership().data?.workspaceId;
  const { market, rpcParams } = useMarket();
  return useQuery({
    queryKey: ["dashboard-metrics", workspaceId, days, market.country, market.city],
    enabled: !!workspaceId,
    queryFn: async (): Promise<DashboardMetrics> => {
      const { data, error } = await supabase.rpc("dashboard_metrics", { ws: workspaceId as string, p_days: days, ...rpcParams });
      if (error) throw error;
      return data as DashboardMetrics;
    },
  });
}

/** Önceki döneme göre yüzde değişim; önceki dönem 0 ise karşılaştırma yapılmaz. */
export function percentDelta(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

export function formatDayLabel(isoDay: string): string {
  const [year, month, day] = isoDay.split("-").map(Number);
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1).toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
}

/** Aşama gruplarını donut dilimlerine çevirir; "kapanan" grubu nötr gri ve yalnızca varsa gösterilir. */
export function stageSegments(stageCounts: Record<string, number>): DonutSegment[] {
  const segments: DonutSegment[] = [];
  STAGE_GROUPS.forEach((group, index) => {
    const value = countForGroup(group, stageCounts);
    if (group.key === "closed") {
      if (value > 0) segments.push({ key: group.key, label: group.label, value, color: OTHER_COLOR });
      return;
    }
    segments.push({ key: group.key, label: group.label, value, color: SEGMENT_COLORS[index] ?? OTHER_COLOR });
  });
  return segments;
}
