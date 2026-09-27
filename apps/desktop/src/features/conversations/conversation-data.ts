import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase-client";
import { useWorkspaceMembership } from "../../lib/use-workspace-membership";

export interface ConversationListRow {
  id: string;
  business_id: string;
  channel: string;
  status: "OPEN" | "CLOSED";
  handled_by: "AI_ASSISTED" | "HUMAN";
  summary: string;
  requirements: string[];
  interest_level: "LOW" | "MEDIUM" | "HIGH" | null;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  updated_at: string;
  businesses: {
    name: string;
    category: string | null;
    district: string | null;
    city: string | null;
    stage: string;
    lead_score: number;
    assigned_to: string | null;
    do_not_contact: boolean;
    version: number;
  } | null;
  messages: Array<{ body: string; direction: "IN" | "OUT"; status: string; created_at: string }>;
}

export interface MessageRow {
  id: string;
  direction: "IN" | "OUT";
  status: "DRAFT" | "APPROVED" | "SENT" | "FAILED" | "RECEIVED" | "DISCARDED";
  body: string;
  subject: string | null;
  intent: string | null;
  intent_confidence: number | null;
  author_type: "USER" | "AI" | "SYSTEM" | "JARVIS";
  created_at: string;
  sent_at: string | null;
}

export function isAwaitingReply(c: Pick<ConversationListRow, "status" | "last_inbound_at" | "last_outbound_at">): boolean {
  if (c.status !== "OPEN" || !c.last_inbound_at) return false;
  return !c.last_outbound_at || c.last_inbound_at > c.last_outbound_at;
}

export function useConversations() {
  const workspaceId = useWorkspaceMembership().data?.workspaceId;
  return useQuery({
    queryKey: ["conversations", workspaceId],
    enabled: !!workspaceId,
    refetchInterval: 30_000,
    queryFn: async (): Promise<ConversationListRow[]> => {
      const { data, error } = await supabase
        .from("conversations")
        .select(
          "id, business_id, channel, status, handled_by, summary, requirements, interest_level, last_inbound_at, last_outbound_at, updated_at, businesses(name, category, district, city, stage, lead_score, assigned_to, do_not_contact, version), messages(body, direction, status, created_at)",
        )
        .eq("workspace_id", workspaceId as string)
        .order("updated_at", { ascending: false })
        .order("created_at", { referencedTable: "messages", ascending: false })
        .limit(1, { referencedTable: "messages" });
      if (error) throw error;
      return (data ?? []) as unknown as ConversationListRow[];
    },
  });
}

export function useMessages(conversationId: string | null) {
  return useQuery({
    queryKey: ["messages", conversationId],
    enabled: !!conversationId,
    refetchInterval: 30_000,
    queryFn: async (): Promise<MessageRow[]> => {
      const { data, error } = await supabase
        .from("messages")
        .select("id, direction, status, body, subject, intent, intent_confidence, author_type, created_at, sent_at")
        .eq("conversation_id", conversationId as string)
        .neq("status", "DISCARDED")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as MessageRow[];
    },
  });
}
