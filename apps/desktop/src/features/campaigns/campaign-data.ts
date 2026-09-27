import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase-client";
import { useWorkspaceMembership } from "../../lib/use-workspace-membership";
import { useRealtimeTable } from "../../lib/use-realtime-table";

export type CampaignStatus = "DRAFT" | "ACTIVE" | "PAUSED" | "COMPLETED";

export interface CampaignSegment {
  city?: string;
  district?: string;
  category?: string;
  minScore?: number;
  websiteStatuses?: string[];
  stages?: string[];
}

export interface CampaignRow {
  id: string;
  name: string;
  description: string | null;
  channel: string;
  segment: CampaignSegment;
  followup_steps: number;
  daily_limit: number;
  status: CampaignStatus;
  created_at: string;
  updated_at: string;
}

export interface CampaignStats {
  total: number;
  queued: number;
  drafted: number;
  sent: number;
  replied: number;
  skipped: number;
  lastSentAt: string | null;
}

export const EMPTY_STATS: CampaignStats = { total: 0, queued: 0, drafted: 0, sent: 0, replied: 0, skipped: 0, lastSentAt: null };

export function useCampaigns() {
  const workspaceId = useWorkspaceMembership().data?.workspaceId;
  useRealtimeTable("campaigns", workspaceId, ["campaigns", workspaceId]);
  useRealtimeTable("campaign_members", workspaceId, ["campaign-stats", workspaceId]);

  const campaigns = useQuery({
    queryKey: ["campaigns", workspaceId],
    enabled: !!workspaceId,
    queryFn: async (): Promise<CampaignRow[]> => {
      const { data, error } = await supabase
        .from("campaigns")
        .select("id, name, description, channel, segment, followup_steps, daily_limit, status, created_at, updated_at")
        .eq("workspace_id", workspaceId as string)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CampaignRow[];
    },
  });

  const stats = useQuery({
    queryKey: ["campaign-stats", workspaceId],
    enabled: !!workspaceId,
    queryFn: async (): Promise<Record<string, CampaignStats>> => {
      const { data, error } = await supabase.rpc("campaign_stats", { ws: workspaceId as string });
      if (error) throw error;
      return (data ?? {}) as Record<string, CampaignStats>;
    },
  });

  return { campaigns, stats };
}

/** Segmentin kullanıcıya okunur özeti ("Kadıköy · Diş Kliniği · 60+ puan"). */
export function describeSegment(segment: CampaignSegment, labels: { minScore: (n: number) => string; websiteStatus: Record<string, string> }): string {
  const parts = [
    segment.district,
    segment.city,
    segment.category,
    segment.minScore ? labels.minScore(segment.minScore) : undefined,
    ...(segment.websiteStatuses ?? []).map((s) => labels.websiteStatus[s] ?? s),
  ].filter((p): p is string => !!p);
  return parts.join(" · ");
}

export function replyRate(stats: CampaignStats): number {
  return stats.sent > 0 ? Math.round((stats.replied / stats.sent) * 100) : 0;
}
