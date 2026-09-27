import { useQuery } from "@tanstack/react-query";
import type { Channel, ChannelMode } from "@lbf/core";
import { supabase } from "../../../lib/supabase-client";
import { useWorkspaceMembership } from "../../../lib/use-workspace-membership";
import { tr } from "../../../i18n/tr";
import type { BusinessDetail } from "../types";

export interface ContactChannelRow {
  id: string;
  channel: Channel | "WEBSITE_FORM";
  value: string;
  normalized_value: string;
  found_via: string;
  status: "UNVERIFIED" | "VALID" | "INVALID" | "BOUNCED";
  confidence: number;
  is_primary: boolean;
}

export interface WorkspaceSettingsRow {
  channel_priority: Channel[];
  channel_modes: Record<Channel, ChannelMode>;
  outreach_limits: { daily_total: number; channels: Record<string, number>; channel_cooldown_hours: number };
}

export function useBusiness(businessId: string | undefined) {
  return useQuery({
    queryKey: ["business", businessId],
    enabled: !!businessId,
    queryFn: async (): Promise<BusinessDetail> => {
      const { data, error } = await supabase.from("businesses").select("*").eq("id", businessId as string).single();
      if (error) throw error;
      return data as BusinessDetail;
    },
  });
}

export function useContactChannels(businessId: string | undefined) {
  return useQuery({
    queryKey: ["contact-channels", businessId],
    enabled: !!businessId,
    queryFn: async (): Promise<ContactChannelRow[]> => {
      const { data, error } = await supabase
        .from("contact_channels")
        .select("id, channel, value, normalized_value, found_via, status, confidence, is_primary")
        .eq("business_id", businessId as string)
        .order("is_primary", { ascending: false })
        .order("confidence", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ContactChannelRow[];
    },
  });
}

export function useWorkspaceSettings() {
  const workspaceId = useWorkspaceMembership().data?.workspaceId;
  return useQuery({
    queryKey: ["workspace-settings", workspaceId],
    enabled: !!workspaceId,
    queryFn: async (): Promise<WorkspaceSettingsRow> => {
      const { data, error } = await supabase
        .from("workspace_settings")
        .select("channel_priority, channel_modes, outreach_limits")
        .eq("workspace_id", workspaceId as string)
        .single();
      if (error) throw error;
      return data as unknown as WorkspaceSettingsRow;
    },
  });
}

/** Sosyal kanallar `platform:handle` olarak normalize edilir; açılabilir URL'e çevirir. */
export function channelHref(row: Pick<ContactChannelRow, "channel" | "value" | "normalized_value">): string | null {
  const handle = row.normalized_value.includes(":") ? row.normalized_value.split(":").pop() : row.normalized_value;
  switch (row.channel) {
    case "EMAIL":
      return `mailto:${row.value}`;
    case "PHONE":
      return `tel:${row.value}`;
    case "WHATSAPP":
      return `https://wa.me/${(handle ?? "").replace(/\D/g, "")}`;
    case "INSTAGRAM":
      return `https://instagram.com/${handle}`;
    case "FACEBOOK":
      return `https://facebook.com/${handle}`;
    case "LINKEDIN":
      return /^https?:/.test(row.value) ? row.value : `https://linkedin.com/company/${handle}`;
    case "TIKTOK":
      return `https://tiktok.com/@${handle}`;
    default:
      return /^https?:/.test(row.value) ? row.value : null;
  }
}

/** "instagram:handle" gibi normalize değerleri okunur biçime çevirir. */
export function channelDisplayValue(row: Pick<ContactChannelRow, "channel" | "value">): string {
  const match = /^(instagram|facebook|linkedin|tiktok):(.+)$/i.exec(row.value);
  return match?.[2] ? `@${match[2]}` : row.value;
}

/** validateDraft sebep kodlarını ("PRICE_MISMATCH:10.000 TL") kullanıcıya okunur metne çevirir. */
export function draftReasonLabel(reason: string): string {
  const [code, ...rest] = reason.split(":");
  const detail = rest.join(":");
  const labels = tr.draft.reasons as Record<string, string>;
  const label = labels[code ?? ""] ?? reason;
  return detail ? `${label} (${detail})` : label;
}
