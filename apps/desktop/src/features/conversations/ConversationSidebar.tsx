import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarPlus, Handshake, Lock, StickyNote, Unlock } from "lucide-react";
import { allowedNextStages, isValidTransition, type BusinessStage } from "@lbf/core";
import { supabase } from "../../lib/supabase-client";
import { useAuthStore } from "../../lib/auth-store";
import { useWorkspaceMembers } from "../../lib/use-workspace-members";
import { tr } from "../../i18n/tr";
import { Button } from "../../components/ui/button";
import { Input, Label, Select, Textarea } from "../../components/ui/input";
import { Card, CardBody, CardHeader } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { KeyValue } from "../../components/ui/data-display";
import { Dialog, DialogContent } from "../../components/ui/primitives";
import { ScoreBadge, StageBadge } from "../../components/domain/badges";
import { rpc } from "../outreach/outreach";
import type { ConversationListRow } from "./conversation-data";

type ActionDialog = "note" | "followup" | "handoff" | null;

export function ConversationSidebar({ conversation, workspaceId }: { conversation: ConversationListRow; workspaceId: string }) {
  const queryClient = useQueryClient();
  const myId = useAuthStore((state) => state.session?.user.id);
  const { byId } = useWorkspaceMembers();
  const [dialog, setDialog] = useState<ActionDialog>(null);
  const [note, setNote] = useState("");
  const [followupDate, setFollowupDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    d.setHours(10, 0, 0, 0);
    return d.toISOString().slice(0, 16);
  });
  const [handoffSummary, setHandoffSummary] = useState("");
  const [error, setError] = useState<string | null>(null);
  const business = conversation.businesses;

  const openHandoff = useQuery({
    queryKey: ["open-handoff", conversation.business_id],
    queryFn: async () => {
      const { data, error: qError } = await supabase
        .from("human_handoffs")
        .select("id, status, summary")
        .eq("business_id", conversation.business_id)
        .eq("status", "OPEN")
        .maybeSingle();
      if (qError) throw qError;
      return data as { id: string; status: string; summary: string } | null;
    },
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["conversations", workspaceId] });
    void queryClient.invalidateQueries({ queryKey: ["open-handoff", conversation.business_id] });
    void queryClient.invalidateQueries({ queryKey: ["business", conversation.business_id] });
    void queryClient.invalidateQueries({ queryKey: ["shell-counters", workspaceId] });
  };
  const onError = (err: unknown) => setError(err instanceof Error ? err.message : tr.common.error);

  const transition = useMutation({
    mutationFn: async (toStage: BusinessStage) => {
      if (!business) return;
      await rpc("transition_stage", {
        p_business_id: conversation.business_id,
        p_to_stage: toStage,
        p_reason: null,
        p_expected_version: business.version,
      });
    },
    onSuccess: invalidate,
    onError,
  });

  const toggleClosed = useMutation({
    mutationFn: async () => {
      const { error: uError } = await supabase
        .from("conversations")
        .update({ status: conversation.status === "OPEN" ? "CLOSED" : "OPEN" })
        .eq("id", conversation.id);
      if (uError) throw uError;
    },
    onSuccess: invalidate,
    onError,
  });

  const addNote = useMutation({
    mutationFn: async () => {
      const { error: iError } = await supabase
        .from("notes")
        .insert({ workspace_id: workspaceId, business_id: conversation.business_id, author_id: myId, body: note.trim() });
      if (iError) throw iError;
    },
    onSuccess: () => {
      setNote("");
      setDialog(null);
      void queryClient.invalidateQueries({ queryKey: ["notes", conversation.business_id] });
    },
    onError,
  });

  const scheduleFollowup = useMutation({
    mutationFn: async () => {
      const { data: existing, error: qError } = await supabase
        .from("follow_ups")
        .select("step")
        .eq("conversation_id", conversation.id)
        .order("step", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (qError) throw qError;
      await rpc("schedule_next_followup", {
        ws: workspaceId,
        p_business_id: conversation.business_id,
        p_conversation_id: conversation.id,
        p_step: ((existing?.step as number | undefined) ?? 0) + 1,
        p_due_at: new Date(followupDate).toISOString(),
      });
    },
    onSuccess: () => {
      setDialog(null);
      void queryClient.invalidateQueries({ queryKey: ["follow-ups", workspaceId] });
    },
    onError,
  });

  const createHandoff = useMutation({
    mutationFn: async () => {
      await rpc("create_handoff", {
        p_business_id: conversation.business_id,
        p_conversation_id: conversation.id,
        p_summary: handoffSummary.trim(),
        p_requirements: conversation.requirements ?? [],
        p_created_by_type: "USER",
      });
      if (business && isValidTransition(business.stage as BusinessStage, "PROPOSAL_READY")) {
        await rpc("transition_stage", {
          p_business_id: conversation.business_id,
          p_to_stage: "PROPOSAL_READY",
          p_reason: tr.conversations.handoffReason,
          p_expected_version: business.version,
        });
      }
    },
    onSuccess: () => {
      setDialog(null);
      invalidate();
    },
    onError,
  });

  if (!business) return null;
  const assignee = business.assigned_to ? byId.get(business.assigned_to)?.name : null;
  const nextStages = allowedNextStages(business.stage as BusinessStage);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title={tr.conversations.customerInfo} />
        <CardBody className="divide-y divide-border/60">
          <KeyValue label={tr.leads.columns.status}>
            <StageBadge stage={business.stage} />
          </KeyValue>
          <KeyValue label={tr.leads.columns.score}>
            <ScoreBadge score={business.lead_score} />
          </KeyValue>
          <KeyValue label={tr.leads.columns.category}>{business.category ?? "—"}</KeyValue>
          <KeyValue label={tr.leads.columns.location}>{[business.district, business.city].filter(Boolean).join(", ") || "—"}</KeyValue>
          <KeyValue label={tr.leads.columns.assigned}>{assignee ?? tr.leads.unassigned}</KeyValue>
          {conversation.interest_level && (
            <KeyValue label={tr.conversations.interestLevel}>
              <Badge tone={conversation.interest_level === "HIGH" ? "green" : conversation.interest_level === "MEDIUM" ? "orange" : "gray"}>
                {tr.conversations.interest[conversation.interest_level]}
              </Badge>
            </KeyValue>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={tr.conversations.quickActions} />
        <CardBody className="space-y-2">
          {nextStages.length > 0 && (
            <Select
              value=""
              disabled={transition.isPending}
              onChange={(e) => e.target.value && transition.mutate(e.target.value as BusinessStage)}
            >
              <option value="">{tr.conversations.changeStage}</option>
              {nextStages.map((s) => (
                <option key={s} value={s}>
                  {tr.stages[s]}
                </option>
              ))}
            </Select>
          )}
          <Button variant="outline" className="w-full justify-start" onClick={() => setDialog("note")}>
            <StickyNote />
            {tr.conversations.addNote}
          </Button>
          <Button variant="outline" className="w-full justify-start" onClick={() => setDialog("followup")}>
            <CalendarPlus />
            {tr.conversations.planFollowup}
          </Button>
          <Button
            variant="outline"
            className="w-full justify-start"
            disabled={!!openHandoff.data}
            onClick={() => {
              setHandoffSummary(conversation.summary);
              setDialog("handoff");
            }}
          >
            <Handshake />
            {openHandoff.data ? tr.conversations.handoffExists : tr.conversations.handoff}
          </Button>
          <Button variant="ghost" className="w-full justify-start" onClick={() => toggleClosed.mutate()}>
            {conversation.status === "OPEN" ? <Lock /> : <Unlock />}
            {conversation.status === "OPEN" ? tr.conversations.close : tr.conversations.reopen}
          </Button>
          {error && <p className="text-xs text-[#f87171]">{error}</p>}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={tr.conversations.summaryLabel} />
        <CardBody className="space-y-3">
          <p className="text-sm leading-relaxed text-text">{conversation.summary || tr.conversations.noSummary}</p>
          {conversation.requirements?.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs text-muted">{tr.conversations.requirements}</p>
              <ul className="list-inside list-disc space-y-0.5 text-sm text-text">
                {conversation.requirements.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </div>
          )}
        </CardBody>
      </Card>

      <Dialog open={dialog === "note"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent title={tr.conversations.addNote}>
          <div className="space-y-3">
            <Textarea rows={4} value={note} onChange={(e) => setNote(e.target.value)} />
            <div className="flex justify-end">
              <Button disabled={!note.trim() || addNote.isPending} onClick={() => addNote.mutate()}>
                {tr.common.save}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "followup"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent title={tr.conversations.planFollowup}>
          <div className="space-y-3">
            <div>
              <Label>{tr.conversations.followupDate}</Label>
              <Input type="datetime-local" value={followupDate} onChange={(e) => setFollowupDate(e.target.value)} />
            </div>
            <div className="flex justify-end">
              <Button disabled={scheduleFollowup.isPending} onClick={() => scheduleFollowup.mutate()}>
                {tr.common.save}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "handoff"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent title={tr.conversations.handoff} description={tr.conversations.handoffDescription}>
          <div className="space-y-3">
            <Textarea rows={6} value={handoffSummary} onChange={(e) => setHandoffSummary(e.target.value)} />
            <div className="flex justify-end">
              <Button disabled={!handoffSummary.trim() || createHandoff.isPending} onClick={() => createHandoff.mutate()}>
                {tr.conversations.handoff}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
