import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Clock, Eye, Loader2, MoreHorizontal, Send, SkipForward, Sparkles } from "lucide-react";
import { composeFollowUp, detectDraftLanguage, type OutreachChannel } from "@lbf/core";
import { supabase } from "../../lib/supabase-client";
import { useWorkspaceMembership } from "../../lib/use-workspace-membership";
import { useWorkspaceMembers } from "../../lib/use-workspace-members";
import { formatDateTime, formatRelative } from "../../lib/format";
import { tr } from "../../i18n/tr";
import { cn } from "../../lib/cn";
import { Button } from "../../components/ui/button";
import { Textarea } from "../../components/ui/input";
import { Card } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Avatar, EmptyState, PageHeader, Table, Td, Th, Tr } from "../../components/ui/data-display";
import {
  CountPill,
  Dialog,
  DialogContent,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../components/ui/primitives";
import { ChannelIcon } from "../../components/domain/channel-icon";
import {
  ASSISTED_FAILURE_REASONS,
  confirmAssistedSent,
  loadFollowupPolicy,
  reportAssistedFailure,
  rpc,
  sendDraftMessage,
  type AssistedFailureReason,
  type SendTarget,
  type SendableMessage,
} from "../outreach/outreach";

interface FollowUpRow {
  id: string;
  business_id: string;
  conversation_id: string;
  step: number;
  due_at: string;
  status: "PENDING" | "DRAFTED" | "SENT" | "CANCELLED" | "SKIPPED";
  cancel_reason: string | null;
  message_id: string | null;
  updated_at: string;
  businesses: { name: string; category: string | null; assigned_to: string | null } | null;
  conversations: { channel: string; last_outbound_at: string | null } | null;
}

type TabKey = "pending" | "sent" | "completed" | "stopped";

function tabFor(row: FollowUpRow): TabKey {
  if (row.status === "PENDING" || row.status === "DRAFTED") return "pending";
  if (row.status === "SENT") return "sent";
  // Müşteri cevap verdiyse veya süreç ilerlediyse sekans amacına ulaşmıştır.
  if (row.status === "CANCELLED" && row.cancel_reason && !/DNC|LOST|DISQUALIFIED|INVALID|BOUNCED/.test(row.cancel_reason)) return "completed";
  return "stopped";
}

export function FollowUpsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceMembership().data?.workspaceId;
  const { byId } = useWorkspaceMembers();
  const [tab, setTab] = useState<TabKey>("pending");
  const [notice, setNotice] = useState<{ tone: "ok" | "warn" | "error"; text: string } | null>(null);
  const [preview, setPreview] = useState<{ row: FollowUpRow; body: string; subject: string | null } | null>(null);
  const [awaitingConfirm, setAwaitingConfirm] = useState<{ target: SendTarget; message: SendableMessage } | null>(null);

  const policyQuery = useQuery({
    queryKey: ["followup-policy", workspaceId],
    enabled: !!workspaceId,
    queryFn: () => loadFollowupPolicy(workspaceId as string),
  });

  const query = useQuery({
    queryKey: ["follow-ups", workspaceId],
    enabled: !!workspaceId,
    queryFn: async (): Promise<FollowUpRow[]> => {
      const { data, error } = await supabase
        .from("follow_ups")
        .select(
          "id, business_id, conversation_id, step, due_at, status, cancel_reason, message_id, updated_at, businesses(name, category, assigned_to), conversations(channel, last_outbound_at)",
        )
        .eq("workspace_id", workspaceId as string)
        .order("due_at", { ascending: true })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as FollowUpRow[];
    },
  });

  const rows = query.data ?? [];
  const counts = useMemo(() => {
    const c: Record<TabKey, number> = { pending: 0, sent: 0, completed: 0, stopped: 0 };
    rows.forEach((r) => (c[tabFor(r)] += 1));
    return c;
  }, [rows]);
  const visible = rows.filter((r) => tabFor(r) === tab);
  const totalSteps = policyQuery.data?.maxFollowUps ?? 2;

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["follow-ups", workspaceId] });
    void queryClient.invalidateQueries({ queryKey: ["shell-counters", workspaceId] });
  };
  const fail = (err: unknown, fallback: string) => setNotice({ tone: "error", text: err instanceof Error ? err.message : fallback });

  const draft = useMutation({
    mutationFn: async (row: FollowUpRow) => {
      if (!workspaceId) return;
      const { data: first, error: firstError } = await supabase
        .from("messages")
        .select("body, subject")
        .eq("conversation_id", row.conversation_id)
        .eq("direction", "OUT")
        .eq("status", "SENT")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (firstError) throw firstError;
      // Takip metni model çağrılmadan, kalıplardan kodla yazılır; dil ilk mesajdan anlaşılır.
      const language = detectDraftLanguage(first?.body ?? "") === "en" ? "en" : "tr";
      const body = composeFollowUp({
        language,
        channel: (row.conversations?.channel ?? "EMAIL") as OutreachChannel,
        step: row.step,
        totalSteps,
        businessName: row.businesses?.name ?? "",
      });
      const subject = row.conversations?.channel === "EMAIL" && first?.subject ? `Re: ${first.subject as string}` : null;
      const { data: message, error } = await supabase
        .from("messages")
        .insert({
          workspace_id: workspaceId,
          conversation_id: row.conversation_id,
          direction: "OUT",
          status: "DRAFT",
          subject,
          body,
          author_type: "AI",
        })
        .select("id")
        .single();
      if (error) throw error;
      await rpc("mark_followup_drafted", { p_followup_id: row.id, p_message_id: message.id });
    },
    onSuccess: () => {
      setNotice(null);
      invalidate();
    },
    onError: (err) => fail(err, tr.draft.error),
  });

  const openPreview = async (row: FollowUpRow) => {
    if (!row.message_id) return;
    const { data, error } = await supabase.from("messages").select("body, subject").eq("id", row.message_id).single();
    if (error) return fail(error, tr.common.error);
    setPreview({ row, body: data.body as string, subject: (data.subject as string | null) ?? null });
  };

  const send = useMutation({
    mutationFn: async (input: { row: FollowUpRow; body: string; subject: string | null }) => {
      if (!workspaceId || !input.row.message_id || !input.row.conversations) throw new Error(tr.followUps.noDraft);
      const { error: updateError } = await supabase.from("messages").update({ body: input.body.trim() }).eq("id", input.row.message_id);
      if (updateError) throw updateError;
      // Sekans ilerletme (mark_followup_sent + sonraki adım) gönderim
      // kesinleştiğinde outreach.finalizeSent içinde yapılır: SMTP'de hemen,
      // asist kanallarda kullanıcı "Gönderdim" dediğinde.
      const target = { conversationId: input.row.conversation_id, businessId: input.row.business_id, channel: input.row.conversations.channel };
      const message = { id: input.row.message_id, body: input.body.trim(), subject: input.subject };
      const mode = await sendDraftMessage(workspaceId, target, message);
      return { mode, target, message };
    },
    onSuccess: ({ mode, target, message }) => {
      setPreview(null);
      setNotice({
        tone: mode === "SMTP" ? "ok" : "warn",
        text: mode === "SMTP" ? tr.conversations.sentEmail : mode === "ASSISTED" ? tr.conversations.sentAssisted : tr.conversations.sentManual,
      });
      setAwaitingConfirm(mode === "SMTP" ? null : { target, message });
      invalidate();
    },
    onError: (err) => {
      fail(err, tr.followUps.sendError);
      invalidate();
    },
  });

  const confirmSent = useMutation({
    mutationFn: () => {
      if (!workspaceId || !awaitingConfirm) throw new Error(tr.common.error);
      return confirmAssistedSent(workspaceId, awaitingConfirm.target, awaitingConfirm.message);
    },
    onSuccess: () => {
      setAwaitingConfirm(null);
      setNotice({ tone: "ok", text: tr.conversations.assistedConfirmed });
      invalidate();
    },
    onError: (err) => fail(err, tr.followUps.sendError),
  });

  const reportFailure = useMutation({
    mutationFn: (reason: AssistedFailureReason) => {
      if (!awaitingConfirm) throw new Error(tr.common.error);
      return reportAssistedFailure(awaitingConfirm.target, awaitingConfirm.message.id, reason);
    },
    onSuccess: () => {
      setAwaitingConfirm(null);
      setNotice({ tone: "warn", text: tr.conversations.assistedFailedNotice });
      invalidate();
    },
    onError: (err) => fail(err, tr.common.error),
  });

  const skip = useMutation({
    mutationFn: (id: string) => rpc("skip_followup", { p_followup_id: id, p_reason: null }),
    onSuccess: invalidate,
    onError: (err) => fail(err, tr.common.error),
  });

  const snooze = useMutation({
    mutationFn: ({ row, days }: { row: FollowUpRow; days: number }) => {
      const next = new Date(Math.max(Date.now(), new Date(row.due_at).getTime()));
      next.setDate(next.getDate() + days);
      return rpc("snooze_followup", { p_followup_id: row.id, p_new_due_at: next.toISOString() });
    },
    onSuccess: invalidate,
    onError: (err) => fail(err, tr.common.error),
  });

  const now = Date.now();

  return (
    <div>
      <PageHeader title={tr.followUps.title} description={tr.followUps.description} />

      {notice && (
        <div
          className={cn(
            "mb-4 rounded-lg px-3 py-2 text-sm",
            notice.tone === "ok" && "bg-success/10 text-success",
            notice.tone === "warn" && "bg-warning/10 text-warning",
            notice.tone === "error" && "bg-danger/10 text-danger",
          )}
        >
          {notice.text}
          {awaitingConfirm && (
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" disabled={confirmSent.isPending} onClick={() => confirmSent.mutate()}>
                {confirmSent.isPending ? <Loader2 className="animate-spin" /> : <Send />}
                {tr.conversations.iSentIt}
              </Button>
              {ASSISTED_FAILURE_REASONS.map((reason) => (
                <Button key={reason} size="sm" variant="outline" disabled={reportFailure.isPending} onClick={() => reportFailure.mutate(reason)}>
                  {tr.conversations.couldNotSend}: {tr.conversations.assistedFailure[reason]}
                </Button>
              ))}
            </div>
          )}
        </div>
      )}

      <Card>
        <div className="flex items-center gap-1 overflow-x-auto border-b border-border px-3">
          {(["pending", "sent", "completed", "stopped"] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={cn(
                "-mb-px flex items-center gap-2 border-b-2 px-3 py-3 text-sm font-medium whitespace-nowrap",
                tab === key ? "border-primary text-text" : "border-transparent text-muted hover:text-text",
              )}
            >
              {tr.followUps.tabs[key]}
              <CountPill>{counts[key]}</CountPill>
            </button>
          ))}
        </div>

        {visible.length === 0 ? (
          <EmptyState icon={CalendarClock} title={tr.followUps.empty} description={tab === "pending" ? tr.followUps.emptyHint : undefined} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{tr.followUps.columns.business}</Th>
                <Th>{tr.followUps.columns.lastMessage}</Th>
                <Th>{tr.followUps.columns.channel}</Th>
                <Th>{tr.followUps.columns.step}</Th>
                <Th>{tr.followUps.columns.due}</Th>
                <Th>{tr.followUps.columns.status}</Th>
                <Th>{tr.leads.columns.assigned}</Th>
                <Th className="w-10">
                  <span className="sr-only">{tr.common.actions}</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => {
                const overdue = row.status !== "SENT" && tab === "pending" && new Date(row.due_at).getTime() < now;
                const assignee = row.businesses?.assigned_to ? byId.get(row.businesses.assigned_to)?.name : null;
                return (
                  <Tr key={row.id}>
                    <Td>
                      <button type="button" onClick={() => navigate(`/leads/${row.business_id}`)} className="flex items-center gap-3 text-left">
                        <Avatar name={row.businesses?.name ?? "?"} size="sm" square />
                        <span>
                          <span className="block max-w-56 truncate font-medium text-text">{row.businesses?.name ?? "—"}</span>
                          <span className="block text-xs text-muted">{row.businesses?.category ?? ""}</span>
                        </span>
                      </button>
                    </Td>
                    <Td className="text-muted">{row.conversations?.last_outbound_at ? formatRelative(row.conversations.last_outbound_at) : "—"}</Td>
                    <Td>
                      <span className="flex items-center gap-2 text-muted">
                        <ChannelIcon channel={row.conversations?.channel ?? "EMAIL"} />
                        {tr.channels[(row.conversations?.channel ?? "EMAIL") as keyof typeof tr.channels]}
                      </span>
                    </Td>
                    <Td className="tabular-nums">
                      {row.step} / {Math.max(totalSteps, row.step)}
                    </Td>
                    <Td className={cn("whitespace-nowrap", overdue ? "text-danger" : "text-muted")}>
                      <span className="flex items-center gap-1.5">
                        <Clock className="size-3.5" />
                        {formatDateTime(row.due_at)}
                      </span>
                    </Td>
                    <Td>
                      {overdue ? (
                        <Badge tone="red">{tr.followUps.overdueTitle}</Badge>
                      ) : (
                        <Badge tone={row.status === "DRAFTED" ? "navy" : row.status === "SENT" ? "green" : row.status === "PENDING" ? "orange" : "gray"}>
                          {tr.followUps.statuses[row.status]}
                        </Badge>
                      )}
                      {row.cancel_reason && tab !== "pending" && <p className="mt-1 text-xs text-subtle">{row.cancel_reason}</p>}
                    </Td>
                    <Td className="text-muted">{assignee ?? "—"}</Td>
                    <Td>
                      {tab === "pending" && (
                        <div className="flex items-center gap-1">
                          {row.status === "PENDING" && (
                            <Button size="sm" variant="outline" disabled={draft.isPending} onClick={() => draft.mutate(row)}>
                              {draft.isPending && draft.variables?.id === row.id ? <Loader2 className="animate-spin" /> : <Sparkles />}
                              {tr.draft.generateButton}
                            </Button>
                          )}
                          {row.status === "DRAFTED" && (
                            <Button size="sm" onClick={() => void openPreview(row)}>
                              <Eye />
                              {tr.followUps.reviewAndSend}
                            </Button>
                          )}
                          <DropdownMenu>
                            <DropdownMenuTrigger className="rounded-md p-1.5 text-muted hover:bg-surface-3 hover:text-text" aria-label={tr.common.actions}>
                              <MoreHorizontal className="size-4" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent>
                              {[1, 3, 7].map((days) => (
                                <DropdownMenuItem key={days} onSelect={() => snooze.mutate({ row, days })}>
                                  <Clock />
                                  {tr.followUps.snoozeDays(days)}
                                </DropdownMenuItem>
                              ))}
                              <DropdownMenuItem onSelect={() => skip.mutate(row.id)}>
                                <SkipForward />
                                {tr.followUps.skip}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      )}
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <Dialog open={!!preview} onOpenChange={(open) => !open && setPreview(null)}>
        {preview && (
          <DialogContent title={tr.followUps.reviewTitle} description={preview.row.businesses?.name ?? ""} size="lg">
            <div className="space-y-3">
              {preview.subject && <p className="text-sm text-muted">{preview.subject}</p>}
              <Textarea rows={9} value={preview.body} onChange={(e) => setPreview({ ...preview, body: e.target.value })} />
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setPreview(null)}>
                  {tr.common.cancel}
                </Button>
                <Button disabled={!preview.body.trim() || send.isPending} onClick={() => send.mutate(preview)}>
                  {send.isPending ? <Loader2 className="animate-spin" /> : <Send />}
                  {tr.conversations.approveAndSend}
                </Button>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
