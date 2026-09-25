import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  buildClassifyReplyPrompt,
  buildDraftReplyPrompt,
  buildUpdateSummaryPrompt,
  computeFollowUpDueDate,
  hasStopKeyword,
  validateDraft,
  type Channel,
  type OutreachChannel,
} from "@lbf/core";
import {
  classifyReplyOutputSchema,
  draftReplyOutputSchema,
  type ClassifyReplyOutput,
  type DraftReplyOutput,
} from "@lbf/contracts";
import { supabase } from "../../lib/supabase-client";
import { useWorkspaceMembership } from "../../lib/use-workspace-membership";
import { callAiGateway } from "../../lib/ai-gateway-client";
import { getEmailAccount } from "../../lib/email-account";
import { tr } from "../../i18n/tr";
import { Button } from "../../components/ui/button";

interface ConversationRow {
  id: string;
  business_id: string;
  channel: Channel;
  status: string;
  summary: string;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  businesses: { name: string } | null;
}

interface MessageRow {
  id: string;
  direction: "IN" | "OUT";
  status: string;
  body: string;
  subject: string | null;
  intent: string | null;
  created_at: string;
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const ASSISTED_LINK: Partial<Record<Channel, (handle: string) => string>> = {
  INSTAGRAM: (h) => `https://ig.me/m/${h}`,
  FACEBOOK: (h) => `https://m.me/${h}`,
  WHATSAPP: (h) => `https://wa.me/${h}`,
};

export function ConversationsPage() {
  const membership = useWorkspaceMembership();
  const workspaceId = membership.data?.workspaceId;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pasteBody, setPasteBody] = useState("");
  const [pasteSubject, setPasteSubject] = useState("");
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const conversationsQuery = useQuery({
    queryKey: ["conversations", workspaceId],
    enabled: !!workspaceId,
    queryFn: async (): Promise<ConversationRow[]> => {
      const { data, error } = await supabase
        .from("conversations")
        .select("id, business_id, channel, status, summary, last_inbound_at, last_outbound_at, businesses(name)")
        .eq("workspace_id", workspaceId as string)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ConversationRow[];
    },
  });

  const selected = conversationsQuery.data?.find((c) => c.id === selectedId) ?? null;

  const messagesQuery = useQuery({
    queryKey: ["messages", selectedId],
    enabled: !!selectedId,
    queryFn: async (): Promise<MessageRow[]> => {
      const { data, error } = await supabase
        .from("messages")
        .select("id, direction, status, body, subject, intent, created_at")
        .eq("conversation_id", selectedId as string)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as MessageRow[];
    },
  });

  const invalidateThread = () => {
    void queryClient.invalidateQueries({ queryKey: ["messages", selectedId] });
    void queryClient.invalidateQueries({ queryKey: ["conversations", workspaceId] });
  };

  const pasteReplyMutation = useMutation({
    mutationFn: async () => {
      if (!workspaceId || !selected) return;
      const stopByKeyword = hasStopKeyword(pasteBody);

      const classifyRequest = buildClassifyReplyPrompt({
        lastInboundMessage: pasteBody,
        conversationSummary: selected.summary,
      });
      const classifyResult = await callAiGateway(workspaceId, classifyRequest, {
        entityType: "conversation",
        entityId: selected.id,
      });
      const classification = classifyReplyOutputSchema.parse(classifyResult.json) as ClassifyReplyOutput;
      const stopRequest = stopByKeyword || (classification.intent === "STOP_CONTACT" && classification.confidence >= 0.5);

      await supabase.rpc("record_inbound", {
        ws: workspaceId,
        p_business_id: selected.business_id,
        p_channel: selected.channel,
        p_body: pasteBody,
        p_subject: pasteSubject || null,
        p_external_message_id: null,
        p_intent: classification.intent,
        p_intent_confidence: classification.confidence,
        p_stop_request: stopRequest,
      });

      const summaryRequest = buildUpdateSummaryPrompt({
        previousSummary: selected.summary,
        newMessages: [{ direction: "IN", body: pasteBody }],
      });
      const summaryResult = await callAiGateway(workspaceId, summaryRequest, {
        entityType: "conversation",
        entityId: selected.id,
      });
      const summaryOutput = summaryResult.json as { summary?: string; interest_level?: string };
      if (summaryOutput.summary) {
        await supabase
          .from("conversations")
          .update({ summary: summaryOutput.summary, interest_level: summaryOutput.interest_level ?? null })
          .eq("id", selected.id);
      }
    },
    onSuccess: () => {
      setPasteBody("");
      setPasteSubject("");
      setPasteError(null);
      invalidateThread();
    },
    onError: (err) => {
      setPasteError(err instanceof Error ? err.message : tr.conversations.pasteError);
    },
  });

  const draftReplyMutation = useMutation({
    mutationFn: async () => {
      if (!workspaceId || !selected) return;
      if (selected.channel === "PHONE") {
        throw new Error(tr.conversations.phoneNoDraft);
      }
      const channel: OutreachChannel = selected.channel;
      const lastMessages = (messagesQuery.data ?? []).slice(-4).map((m) => ({
        direction: m.direction,
        body: m.body,
      }));
      const lastIntent = [...(messagesQuery.data ?? [])].reverse().find((m) => m.intent)?.intent ?? "UNCLEAR";

      const { data: kbEntries } = await supabase
        .from("kb_entries")
        .select("id, title, body")
        .eq("workspace_id", workspaceId)
        .eq("type", "FAQ")
        .eq("is_active", true)
        .limit(5);

      const request = buildDraftReplyPrompt({
        conversationSummary: selected.summary,
        lastMessages,
        intent: lastIntent,
        relevantKb: (kbEntries ?? []).map((k) => ({ id: k.id as string, title: k.title as string, content: k.body as string })),
        channel,
      });

      const result = await callAiGateway(workspaceId, request, { entityType: "conversation", entityId: selected.id });
      const parsed = draftReplyOutputSchema.parse(result.json) as DraftReplyOutput;

      const { data: packages } = await supabase
        .from("service_packages")
        .select("id, name, summary, price_min, price_max, delivery_days_min, delivery_days_max")
        .eq("workspace_id", workspaceId)
        .eq("is_active", true);
      const { data: referenceEntries } = await supabase
        .from("kb_entries")
        .select("title")
        .eq("workspace_id", workspaceId)
        .eq("type", "REFERENCE")
        .eq("is_verified_real", true);

      const validation = validateDraft({
        body: parsed.body,
        channel,
        packages: (packages ?? []).map((p) => ({
          id: p.id as string,
          name: p.name as string,
          summary: (p.summary as string | null) ?? "",
          priceMin: p.price_min as number | null,
          priceMax: p.price_max as number | null,
          deliveryDaysMin: p.delivery_days_min as number | null,
          deliveryDaysMax: p.delivery_days_max as number | null,
        })),
        salesRules: { allowDiscountMention: false, forbiddenWords: ["indirim", "%", "bedava", "garanti"] },
        verifiedReferenceNames: (referenceEntries ?? []).map((e) => e.title as string),
        stopRequest: false,
      });

      if (!validation.ok) {
        throw new Error(`${tr.draft.rejectedTitle}: ${validation.reasons.join(", ")}`);
      }

      const { error } = await supabase.from("messages").insert({
        workspace_id: workspaceId,
        conversation_id: selected.id,
        direction: "OUT",
        status: "DRAFT",
        body: parsed.body,
        author_type: "AI",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setDraftError(null);
      invalidateThread();
    },
    onError: (err) => {
      setDraftError(err instanceof Error ? err.message : tr.draft.error);
    },
  });

  const sendMutation = useMutation({
    mutationFn: async (message: MessageRow) => {
      if (!selected || !workspaceId) return;

      const isFirstOutbound = !(messagesQuery.data ?? []).some((m) => m.direction === "OUT" && m.status === "SENT");

      await supabase.rpc("approve_message", { p_message_id: message.id });

      if (selected.channel === "EMAIL") {
        const account = await getEmailAccount();
        if (!account) throw new Error(tr.conversations.noEmailAccount);
        const { data: channelRow } = await supabase
          .from("contact_channels")
          .select("value")
          .eq("business_id", selected.business_id)
          .eq("channel", "EMAIL")
          .limit(1)
          .maybeSingle();
        if (!channelRow) throw new Error(tr.conversations.noEmailAddress);

        await invoke("send_email", {
          smtp: {
            host: account.smtpHost,
            port: account.smtpPort,
            username: account.smtpUsername,
            password: account.smtpPassword,
            from_name: account.fromName,
            from_email: account.fromEmail,
          },
          message: { to_email: channelRow.value, subject: message.subject ?? "", body: message.body },
        });
      } else {
        const linkBuilder = ASSISTED_LINK[selected.channel];
        if (linkBuilder) {
          const { data: channelRow } = await supabase
            .from("contact_channels")
            .select("normalized_value")
            .eq("business_id", selected.business_id)
            .eq("channel", selected.channel)
            .limit(1)
            .maybeSingle();
          const handle = (channelRow?.normalized_value as string | undefined)?.split(":").pop() ?? "";
          await navigator.clipboard.writeText(message.body);
          await openUrl(linkBuilder(handle));
        }
      }

      const contentHash = await sha256Hex(message.body);
      await supabase.rpc("mark_message_sent", { p_message_id: message.id, p_content_hash: contentHash, p_external_message_id: null });

      if (isFirstOutbound) {
        const { data: settings } = await supabase
          .from("workspace_settings")
          .select("followup_policy")
          .eq("workspace_id", workspaceId)
          .single();
        const policy = settings?.followup_policy as {
          steps: Array<{ afterDays: number }>;
          sendWindow: { days: number[]; from: string };
          skipHolidays: boolean;
        };
        const firstStep = policy?.steps?.[0];
        if (firstStep) {
          const dueAt = computeFollowUpDueDate(new Date(), firstStep.afterDays, policy.sendWindow, policy.skipHolidays);
          await supabase.rpc("schedule_next_followup", {
            ws: workspaceId,
            p_business_id: selected.business_id,
            p_conversation_id: selected.id,
            p_step: 1,
            p_due_at: dueAt.toISOString(),
          });
        }
      }
    },
    onSuccess: invalidateThread,
    onError: async (err, message) => {
      await supabase.rpc("mark_message_failed", {
        p_message_id: message.id,
        p_reason: err instanceof Error ? err.message : tr.conversations.sendError,
      });
      invalidateThread();
    },
  });

  const discardMutation = useMutation({
    mutationFn: async (messageId: string) => {
      await supabase.rpc("discard_message", { p_message_id: messageId });
    },
    onSuccess: invalidateThread,
  });

  if (!workspaceId) return <p className="text-sm text-slate-500">{tr.common.loading}</p>;

  return (
    <div className="grid grid-cols-3 gap-4">
      <div className="col-span-1 space-y-2 rounded-lg border border-slate-200 bg-white p-3">
        <h2 className="text-sm font-semibold text-slate-700">{tr.nav.conversations}</h2>
        <ul className="space-y-1">
          {conversationsQuery.data?.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => setSelectedId(c.id)}
                className={`w-full rounded-md px-2 py-2 text-left text-sm ${selectedId === c.id ? "bg-slate-900 text-white" : "hover:bg-slate-50"}`}
              >
                <div className="font-medium">{c.businesses?.name ?? "—"}</div>
                <div className="text-xs opacity-70">{c.channel}</div>
              </button>
            </li>
          ))}
          {conversationsQuery.data?.length === 0 && <li className="text-xs text-slate-400">{tr.conversations.empty}</li>}
        </ul>
      </div>

      <div className="col-span-2 space-y-3">
        {!selected && <p className="text-sm text-slate-400">{tr.conversations.selectPrompt}</p>}

        {selected && (
          <>
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-xs text-slate-500">{tr.conversations.summaryLabel}</p>
              <p className="text-sm text-slate-800">{selected.summary || tr.conversations.noSummary}</p>
            </div>

            <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-3">
              {messagesQuery.data?.map((m) => (
                <div key={m.id} className={`rounded-md p-2 text-sm ${m.direction === "IN" ? "bg-slate-50" : "bg-blue-50"}`}>
                  <p className="whitespace-pre-wrap text-slate-800">{m.body}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    {m.direction === "IN" ? tr.conversations.inbound : tr.conversations.outbound} · {m.status} ·{" "}
                    {new Date(m.created_at).toLocaleString("tr-TR")}
                  </p>
                  {m.status === "DRAFT" && (
                    <div className="mt-2 flex gap-2">
                      <Button size="sm" disabled={sendMutation.isPending} onClick={() => sendMutation.mutate(m)}>
                        {tr.conversations.approveAndSend}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => discardMutation.mutate(m.id)}>
                        {tr.conversations.discard}
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-3">
              <h3 className="text-sm font-medium text-slate-700">{tr.conversations.draftTitle}</h3>
              {draftError && <p className="text-xs text-red-600">{draftError}</p>}
              <Button size="sm" variant="outline" disabled={draftReplyMutation.isPending} onClick={() => draftReplyMutation.mutate()}>
                {tr.draft.generateButton}
              </Button>
            </div>

            <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-3">
              <h3 className="text-sm font-medium text-slate-700">{tr.conversations.pasteTitle}</h3>
              {pasteError && <p className="text-xs text-red-600">{pasteError}</p>}
              {selected.channel === "EMAIL" && (
                <input
                  className="h-9 w-full rounded-md border border-slate-300 px-3 text-sm"
                  placeholder={tr.conversations.subjectPlaceholder}
                  value={pasteSubject}
                  onChange={(e) => setPasteSubject(e.target.value)}
                />
              )}
              <textarea
                className="w-full rounded-md border border-slate-300 p-2 text-sm"
                rows={3}
                placeholder={tr.conversations.pastePlaceholder}
                value={pasteBody}
                onChange={(e) => setPasteBody(e.target.value)}
              />
              <Button size="sm" disabled={!pasteBody.trim() || pasteReplyMutation.isPending} onClick={() => pasteReplyMutation.mutate()}>
                {tr.conversations.pasteSubmit}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
