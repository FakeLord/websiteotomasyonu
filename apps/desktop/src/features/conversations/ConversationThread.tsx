import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Bot, Check, ClipboardPaste, ExternalLink, Loader2, Pencil, Send, Sparkles, Trash2, X } from "lucide-react";
import {
  buildDraftReplyPrompt,
  detectDraftLanguage,
  findForeignWords,
  isAutoReply,
  retryRejected,
  stripSignOff,
  validateDraft,
  type OutreachChannel,
} from "@lbf/core";
import { draftReplyOutputSchema } from "@lbf/contracts";
import { ingestInboundMessage } from "../outreach/inbound";
import { supabase } from "../../lib/supabase-client";
import { callAiGateway } from "../../lib/ai-gateway-client";
import { formatDateTime } from "../../lib/format";
import { tr } from "../../i18n/tr";
import { cn } from "../../lib/cn";
import { Button } from "../../components/ui/button";
import { Input, Textarea } from "../../components/ui/input";
import { Badge } from "../../components/ui/badge";
import { Avatar } from "../../components/ui/data-display";
import { ChannelIcon } from "../../components/domain/channel-icon";
import {
  ASSISTED_FAILURE_REASONS,
  FORBIDDEN_WORDS,
  businessContextNames,
  confirmAssistedSent,
  reopenAssistedMessage,
  reportAssistedFailure,
  rpc,
  sendDraftMessage,
  type AssistedFailureReason,
  type DeliveryMode,
} from "../outreach/outreach";
import { draftReasonLabel } from "../leads/detail/lead-data";
import { useMessages, type ConversationListRow, type MessageRow } from "./conversation-data";

const INTENT_TONES = {
  INTERESTED: "green",
  QUESTION: "blue",
  NOT_INTERESTED: "gray",
  STOP_CONTACT: "red",
  UNCLEAR: "orange",
  OTHER: "gray",
  AUTO_REPLY: "navy",
  WRONG_CONTACT: "orange",
  ALREADY_HAS_PROVIDER: "gray",
} as const;

export function ConversationThread({ conversation, workspaceId }: { conversation: ConversationListRow; workspaceId: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const messagesQuery = useMessages(conversation.id);
  const messages = messagesQuery.data ?? [];
  const [composer, setComposer] = useState<"reply" | "inbound">("reply");
  const [text, setText] = useState("");
  const [subject, setSubject] = useState("");
  const [notice, setNotice] = useState<{ tone: "ok" | "warn" | "error"; text: string } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [failingId, setFailingId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const business = conversation.businesses;
  const channel = conversation.channel;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length, conversation.id]);

  useEffect(() => {
    setNotice(null);
    setText("");
    setEditingId(null);
  }, [conversation.id]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["messages", conversation.id] });
    void queryClient.invalidateQueries({ queryKey: ["conversations", workspaceId] });
    void queryClient.invalidateQueries({ queryKey: ["shell-counters", workspaceId] });
  };

  const fail = (err: unknown, fallback: string) => setNotice({ tone: "error", text: err instanceof Error ? err.message : fallback });

  const recordInbound = useMutation({
    mutationFn: () =>
      ingestInboundMessage(workspaceId, {
        businessId: conversation.business_id,
        channel,
        body: text,
        subject: subject || null,
        autoReply: channel === "EMAIL" && isAutoReply({}, subject),
        conversationSummary: conversation.summary,
      }),
    onSuccess: ({ aiFailed, stopRequest }) => {
      setText("");
      setSubject("");
      setNotice(
        stopRequest
          ? { tone: "warn", text: tr.conversations.stopRecorded }
          : aiFailed
            ? { tone: "warn", text: tr.conversations.savedWithoutAi }
            : { tone: "ok", text: tr.conversations.inboundSaved },
      );
      invalidate();
      // Gelen cevap aşamayı değiştirebilir (CONTACTED → REPLIED, STOP → LOST).
      void queryClient.invalidateQueries({ queryKey: ["business", conversation.business_id] });
      void queryClient.invalidateQueries({ queryKey: ["businesses", workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ["follow-ups", workspaceId] });
    },
    onError: (err) => fail(err, tr.conversations.pasteError),
  });

  const saveManualDraft = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("messages").insert({
        workspace_id: workspaceId,
        conversation_id: conversation.id,
        direction: "OUT",
        status: "DRAFT",
        subject: channel === "EMAIL" ? subject || null : null,
        body: text.trim(),
        author_type: "USER",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setText("");
      setNotice(null);
      invalidate();
    },
    onError: (err) => fail(err, tr.common.error),
  });

  const aiReply = useMutation({
    mutationFn: async () => {
      if (channel === "PHONE") throw new Error(tr.conversations.phoneNoDraft);
      const outreachChannel = channel as OutreachChannel;
      const lastIntent = [...messages].reverse().find((m) => m.intent)?.intent ?? "UNCLEAR";
      const [{ data: kbEntries }, { data: packages }, { data: references }] = await Promise.all([
        supabase.from("kb_entries").select("id, title, body").eq("workspace_id", workspaceId).in("type", ["FAQ", "COMPANY", "OBJECTION"]).eq("is_active", true).limit(8),
        supabase.from("service_packages").select("id, name, summary, price_min, price_max, delivery_days_min, delivery_days_max").eq("workspace_id", workspaceId).eq("is_active", true),
        supabase.from("kb_entries").select("title").eq("workspace_id", workspaceId).eq("type", "REFERENCE").eq("is_verified_real", true),
      ]);
      // Cevap, müşterinin son mesajının dilinde yazılır; yanlış dil, yabancı kelime veya kontrol ihlali olursa
      // kullanıcıya gösterilmeden yeniden üretilir (en çok 3 deneme).
      const lastInbound = [...messages].reverse().find((m) => m.direction === "IN")?.body ?? "";
      const language = detectDraftLanguage(lastInbound) === "en" ? "en" : "tr";
      const packageInfo = (packages ?? []).map((p) => ({
        id: p.id as string,
        name: p.name as string,
        summary: (p.summary as string | null) ?? "",
        priceMin: p.price_min as number | null,
        priceMax: p.price_max as number | null,
        deliveryDaysMin: p.delivery_days_min as number | null,
        deliveryDaysMax: p.delivery_days_max as number | null,
      }));
      const request = buildDraftReplyPrompt({
        conversationSummary: conversation.summary,
        lastMessages: messages.filter((m) => m.status !== "DRAFT").slice(-4).map((m) => ({ direction: m.direction, body: m.body })),
        intent: lastIntent,
        relevantKb: (kbEntries ?? []).map((k) => ({ id: k.id as string, title: k.title as string, content: k.body as string })),
        channel: outreachChannel,
        language,
      });
      const contextNames = business ? businessContextNames(business) : [];
      const attemptDraft = async (attempt: number) => {
        const result = await callAiGateway(
          workspaceId,
          request,
          { entityType: "conversation", entityId: conversation.id },
          { fresh: attempt > 0 },
        );
        const checked = draftReplyOutputSchema.safeParse(result.json);
        if (!checked.success) return { ok: false, reasons: ["INVALID_SHAPE"], parsed: null as null | typeof checked.data };
        const body = stripSignOff(checked.data.body);
        const written = detectDraftLanguage(body);
        const leaked = findForeignWords(body, language, [business?.name ?? "", ...contextNames]);
        const validation = validateDraft({
          body,
          channel: outreachChannel,
          packages: packageInfo,
          salesRules: { allowDiscountMention: false, forbiddenWords: FORBIDDEN_WORDS },
          verifiedReferenceNames: (references ?? []).map((e) => e.title as string),
          recipientBusinessName: business?.name,
          contextNames,
          stopRequest: business?.do_not_contact ?? false,
        });
        const reasons = [
          ...(written !== "unknown" && written !== language ? ["WRONG_LANGUAGE"] : []),
          ...(leaked.length > 0 ? [`FOREIGN_WORD:${leaked[0]}`] : []),
          ...validation.reasons,
        ];
        return { ok: reasons.length === 0, reasons, parsed: { ...checked.data, body } as typeof checked.data | null };
      };
      const outcome = await retryRejected(attemptDraft);
      if (!outcome.ok || !outcome.parsed) {
        throw new Error(`${tr.draft.rejectedTitle}: ${outcome.reasons.map(draftReasonLabel).join(", ")}`);
      }
      const parsed = outcome.parsed;
      const { error } = await supabase.from("messages").insert({
        workspace_id: workspaceId,
        conversation_id: conversation.id,
        direction: "OUT",
        status: "DRAFT",
        body: parsed.body,
        author_type: "AI",
      });
      if (error) throw error;
      return parsed;
    },
    onSuccess: (parsed) => {
      setNotice(parsed.proposes_handoff ? { tone: "warn", text: tr.conversations.aiSuggestsHandoff } : null);
      invalidate();
    },
    onError: (err) => fail(err, tr.draft.error),
  });

  const target = { conversationId: conversation.id, businessId: conversation.business_id, channel };
  const asSendable = (m: MessageRow) => ({ id: m.id, body: m.body, subject: m.subject });

  const send = useMutation({
    mutationFn: (message: MessageRow): Promise<DeliveryMode> => sendDraftMessage(workspaceId, target, asSendable(message)),
    onSuccess: (mode) => {
      setNotice({
        tone: mode === "SMTP" ? "ok" : "warn",
        text: mode === "SMTP" ? tr.conversations.sentEmail : mode === "ASSISTED" ? tr.conversations.sentAssisted : tr.conversations.sentManual,
      });
      invalidate();
      void queryClient.invalidateQueries({ queryKey: ["follow-ups", workspaceId] });
    },
    onError: (err) => {
      fail(err, tr.conversations.sendError);
      invalidate();
    },
  });

  const confirmSent = useMutation({
    mutationFn: (message: MessageRow) => confirmAssistedSent(workspaceId, target, asSendable(message)),
    onSuccess: () => {
      setNotice({ tone: "ok", text: tr.conversations.assistedConfirmed });
      invalidate();
      void queryClient.invalidateQueries({ queryKey: ["follow-ups", workspaceId] });
    },
    onError: (err) => fail(err, tr.conversations.sendError),
  });

  const reportFailure = useMutation({
    mutationFn: ({ message, reason }: { message: MessageRow; reason: AssistedFailureReason }) =>
      reportAssistedFailure(target, message.id, reason),
    onSuccess: () => {
      setFailingId(null);
      setNotice({ tone: "warn", text: tr.conversations.assistedFailedNotice });
      invalidate();
      void queryClient.invalidateQueries({ queryKey: ["follow-ups", workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ["contact-channels", conversation.business_id] });
    },
    onError: (err) => fail(err, tr.common.error),
  });

  const reopen = useMutation({
    mutationFn: (message: MessageRow) => reopenAssistedMessage(target, asSendable(message)),
    onError: (err) => fail(err, tr.common.error),
  });

  const discard = useMutation({
    mutationFn: (id: string) => rpc("discard_message", { p_message_id: id }),
    onSuccess: invalidate,
  });

  const saveEdit = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("messages").update({ body: editBody.trim() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      setEditingId(null);
      invalidate();
    },
  });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <Avatar name={business?.name ?? "?"} size="md" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-text">{business?.name ?? "—"}</p>
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <ChannelIcon channel={channel} className="size-3.5" />
            {tr.channels[channel as keyof typeof tr.channels] ?? channel}
            {business?.district ? ` · ${business.district}` : ""}
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={() => navigate(`/leads/${conversation.business_id}`)}>
          <ExternalLink />
          {tr.conversations.openLead}
        </Button>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && <p className="py-8 text-center text-sm text-muted">{tr.conversations.noMessages}</p>}
        {messages.map((m) => {
          const outbound = m.direction === "OUT";
          const isDraft = m.status === "DRAFT";
          const awaitingConfirm = outbound && m.status === "APPROVED";
          return (
            <div key={m.id} className={cn("flex", outbound ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[75%] rounded-2xl px-4 py-2.5 text-sm",
                  !outbound && "rounded-bl-md bg-surface-3 text-text",
                  outbound && !isDraft && !awaitingConfirm && "rounded-br-md bg-primary text-white",
                  isDraft && "rounded-br-md border border-primary/30 bg-primary/5 text-text",
                  awaitingConfirm && "rounded-br-md border border-warning/50 bg-warning/10 text-text",
                  m.status === "FAILED" && "border border-danger/50 bg-danger/10 text-text",
                )}
              >
                {isDraft && (
                  <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-primary">
                    {m.author_type === "AI" ? <Bot className="size-3.5" /> : <Pencil className="size-3.5" />}
                    {m.author_type === "AI" ? tr.conversations.aiDraft : tr.conversations.manualDraft}
                  </p>
                )}
                {awaitingConfirm && (
                  <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-warning">
                    <ClipboardPaste className="size-3.5" />
                    {tr.conversations.awaitingConfirm}
                  </p>
                )}
                {m.subject && <p className="mb-1 text-xs font-semibold opacity-80">{m.subject}</p>}
                {editingId === m.id ? (
                  <div className="space-y-2">
                    <Textarea value={editBody} onChange={(e) => setEditBody(e.target.value)} rows={6} className="bg-surface" />
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                        <X />
                      </Button>
                      <Button size="sm" disabled={!editBody.trim()} onClick={() => saveEdit.mutate(m.id)}>
                        <Check />
                        {tr.common.save}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap">{m.body}</p>
                )}
                <div
                  className={cn(
                    "mt-1.5 flex flex-wrap items-center gap-2 text-[11px]",
                    outbound && !isDraft && !awaitingConfirm ? "text-white/70" : "text-muted",
                  )}
                >
                  <span>{formatDateTime(m.sent_at ?? m.created_at)}</span>
                  {m.status === "FAILED" && <Badge tone="red">{tr.conversations.failed}</Badge>}
                  {m.intent && <Badge tone={INTENT_TONES[m.intent as keyof typeof INTENT_TONES] ?? "gray"}>{tr.intents[m.intent as keyof typeof tr.intents] ?? m.intent}</Badge>}
                </div>
                {isDraft && editingId !== m.id && (
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    <Button size="sm" disabled={send.isPending} onClick={() => send.mutate(m)}>
                      {send.isPending ? <Loader2 className="animate-spin" /> : <Send />}
                      {tr.conversations.approveAndSend}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditingId(m.id);
                        setEditBody(m.body);
                      }}
                    >
                      <Pencil />
                      {tr.common.edit}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => discard.mutate(m.id)}>
                      <Trash2 />
                      {tr.conversations.discard}
                    </Button>
                  </div>
                )}
                {awaitingConfirm && (
                  <div className="mt-2.5 space-y-2">
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" disabled={confirmSent.isPending} onClick={() => confirmSent.mutate(m)}>
                        {confirmSent.isPending ? <Loader2 className="animate-spin" /> : <Check />}
                        {tr.conversations.iSentIt}
                      </Button>
                      <Button size="sm" variant="outline" disabled={reopen.isPending} onClick={() => reopen.mutate(m)}>
                        <ExternalLink />
                        {tr.conversations.reopenChat}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setFailingId(failingId === m.id ? null : m.id)}>
                        <X />
                        {tr.conversations.couldNotSend}
                      </Button>
                    </div>
                    {failingId === m.id && (
                      <div className="flex flex-wrap gap-2 rounded-lg bg-surface-2 p-2">
                        {ASSISTED_FAILURE_REASONS.map((reason) => (
                          <Button
                            key={reason}
                            size="sm"
                            variant="outline"
                            disabled={reportFailure.isPending}
                            onClick={() => reportFailure.mutate({ message: m, reason })}
                          >
                            {tr.conversations.assistedFailure[reason]}
                          </Button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {notice && (
        <div
          className={cn(
            "mx-4 mb-2 rounded-lg px-3 py-2 text-sm",
            notice.tone === "ok" && "bg-success/10 text-success",
            notice.tone === "warn" && "bg-warning/10 text-warning",
            notice.tone === "error" && "bg-danger/10 text-danger",
          )}
        >
          {notice.text}
        </div>
      )}

      <div className="border-t border-border p-3">
        <div className="mb-2 flex items-center gap-1">
          <button
            type="button"
            onClick={() => setComposer("reply")}
            className={cn("rounded-md px-2.5 py-1 text-xs font-medium", composer === "reply" ? "bg-surface-3 text-text" : "text-muted hover:text-text")}
          >
            {tr.conversations.writeReply}
          </button>
          <button
            type="button"
            onClick={() => setComposer("inbound")}
            className={cn("flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium", composer === "inbound" ? "bg-surface-3 text-text" : "text-muted hover:text-text")}
          >
            <ClipboardPaste className="size-3.5" />
            {tr.conversations.pasteTitle}
          </button>
          <Button size="sm" variant="default" className="ml-auto" disabled={aiReply.isPending || conversation.status === "CLOSED"} onClick={() => aiReply.mutate()}>
            {aiReply.isPending ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {tr.conversations.suggestReply}
          </Button>
        </div>
        {channel === "EMAIL" && <Input className="mb-2" placeholder={tr.conversations.subjectPlaceholder} value={subject} onChange={(e) => setSubject(e.target.value)} />}
        <div className="flex items-end gap-2">
          <Textarea
            rows={2}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={composer === "reply" ? tr.conversations.replyPlaceholder : tr.conversations.pastePlaceholder}
            className="flex-1"
          />
          <Button
            disabled={!text.trim() || recordInbound.isPending || saveManualDraft.isPending}
            onClick={() => (composer === "reply" ? saveManualDraft.mutate() : recordInbound.mutate())}
          >
            {composer === "reply" ? tr.conversations.saveDraft : tr.conversations.pasteSubmit}
          </Button>
        </div>
      </div>
    </div>
  );
}
