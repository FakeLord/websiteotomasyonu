import { useQuery } from "@tanstack/react-query";
import { supabase } from "./supabase-client";
import { useWorkspaceMembership } from "./use-workspace-membership";
import { tr } from "../i18n/tr";
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
  return useQuery({
    queryKey: ["dashboard-metrics", workspaceId, days],
    enabled: !!workspaceId,
    queryFn: async (): Promise<DashboardMetrics> => {
      const { data, error } = await supabase.rpc("dashboard_metrics", { ws: workspaceId as string, p_days: days });
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

/** 11 aşamayı donut için 6 anlamlı gruba + "kapanan" grubuna indirger. */
export function stageSegments(stageCounts: Record<string, number>): DonutSegment[] {
  const sum = (...keys: string[]) => keys.reduce((total, key) => total + (stageCounts[key] ?? 0), 0);
  const groups: Array<Omit<DonutSegment, "color">> = [
    { key: "new", label: tr.stageGroups.new, value: sum("NEW", "QUALIFIED", "OUTREACH_READY") },
    { key: "contacted", label: tr.stageGroups.contacted, value: sum("CONTACTED") },
    { key: "replied", label: tr.stageGroups.replied, value: sum("REPLIED") },
    { key: "engaged", label: tr.stageGroups.engaged, value: sum("ENGAGED") },
    { key: "proposal", label: tr.stageGroups.proposal, value: sum("PROPOSAL_READY", "HANDED_OFF") },
    { key: "won", label: tr.stageGroups.won, value: sum("WON") },
  ];
  const segments: DonutSegment[] = groups.map((g, i) => ({ ...g, color: SEGMENT_COLORS[i] ?? OTHER_COLOR }));
  const closed = sum("DISQUALIFIED", "LOST");
  if (closed > 0) segments.push({ key: "closed", label: tr.stageGroups.closed, value: closed, color: OTHER_COLOR });
  return segments;
}
