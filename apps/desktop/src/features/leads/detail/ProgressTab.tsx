import { useQuery } from "@tanstack/react-query";
import { CalendarClock, MessageSquareReply, Phone, StickyNote, Workflow } from "lucide-react";
import { supabase } from "../../../lib/supabase-client";
import { useWorkspaceMembers } from "../../../lib/use-workspace-members";
import { formatDateTime, formatRelative } from "../../../lib/format";
import { tr } from "../../../i18n/tr";
import { Card, CardBody, CardHeader } from "../../../components/ui/card";
import { Badge } from "../../../components/ui/badge";
import { StageBadge } from "../../../components/domain/badges";
import { ChannelIcon } from "../../../components/domain/channel-icon";
import type { BusinessDetail } from "../types";
import { useContactAttempts } from "./contact-attempts";
import {
  buildProgressTimeline,
  summarizeContact,
  type MessageSource,
  type NoteSource,
  type ProgressEvent,
  type TransitionSource,
} from "./progress-timeline";

const OUTCOME_TONES = { ATTEMPTED: "gray", SENT: "blue", REPLIED: "green", UNREACHABLE: "orange", NOT_INTERESTED: "red", LATER: "violet", CANCELLED: "gray" } as const;

function useProgressSources(businessId: string) {
  const transitions = useQuery({
    queryKey: ["stage-transitions", businessId],
    queryFn: async (): Promise<TransitionSource[]> => {
      const { data, error } = await supabase
        .from("stage_transitions")
        .select("id, from_stage, to_stage, reason, actor_type, created_at")
        .eq("business_id", businessId)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as TransitionSource[];
    },
  });
  const notes = useQuery({
    queryKey: ["notes", businessId],
    queryFn: async (): Promise<NoteSource[]> => {
      const { data, error } = await supabase
        .from("notes")
        .select("id, body, created_at, author_id")
        .eq("business_id", businessId)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as NoteSource[];
    },
  });
  const messages = useQuery({
    queryKey: ["progress-messages", businessId],
    queryFn: async (): Promise<MessageSource[]> => {
      const { data, error } = await supabase
        .from("messages")
        .select("id, direction, status, sent_at, created_at, conversations!inner(business_id, channel)")
        .eq("conversations.business_id", businessId)
        .in("status", ["SENT", "RECEIVED"]);
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as unknown as Array<Omit<MessageSource, "channel"> & { conversations: { channel: string } }>;
      return rows.map(({ conversations, ...row }) => ({ ...row, channel: conversations.channel }));
    },
  });
  const attempts = useContactAttempts(businessId);
  return { transitions, notes, messages, attempts };
}

/**
 * "İlerleme" sekmesi: işletmeye en son kim, ne zaman, hangi kanaldan yazdı ve sonraki adım ne; altında tek zaman çizelgesi
 * (temaslar, aşama geçişleri, notlar, gönderilen mesajlar ve gelen cevaplar).
 */
export function ProgressTab({ business }: { business: BusinessDetail }) {
  const { byId } = useWorkspaceMembers();
  const { transitions, notes, messages, attempts } = useProgressSources(business.id);
  const nameOf = (userId: string | null) => (userId ? (byId.get(userId)?.name ?? tr.progress.unknownUser) : tr.progress.system);

  const events = buildProgressTimeline({
    attempts: attempts.data ?? [],
    transitions: transitions.data ?? [],
    notes: notes.data ?? [],
    messages: messages.data ?? [],
  });
  const summary = summarizeContact(attempts.data ?? [], business.next_action_at ?? null);
  const overdue = summary.nextActionAt !== null && Date.parse(summary.nextActionAt) < Date.now();
  const loading = transitions.isLoading || notes.isLoading || messages.isLoading || attempts.isLoading;
  const error = transitions.error ?? notes.error ?? messages.error ?? attempts.error;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title={tr.progress.summaryTitle} />
        <CardBody className="grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted">{tr.progress.stage}</p>
            <div className="mt-1">
              <StageBadge stage={business.stage} />
            </div>
          </div>
          <div>
            <p className="text-xs text-muted">{tr.progress.lastContact}</p>
            {summary.last ? (
              <p className="mt-1 text-sm text-text">
                <span className="inline-flex items-center gap-1.5">
                  <ChannelIcon channel={summary.last.channel} />
                  {tr.channels[summary.last.channel as keyof typeof tr.channels] ?? summary.last.channel}
                </span>
                <span className="block text-xs text-muted">
                  {nameOf(summary.last.created_by)} · {formatRelative(summary.last.created_at)} · {tr.contactOutcome.outcomes[summary.last.outcome]}
                </span>
              </p>
            ) : (
              <p className="mt-1 text-sm text-muted">{tr.progress.noContactYet}</p>
            )}
          </div>
          <div>
            <p className="text-xs text-muted">{tr.progress.nextFollowUp}</p>
            {summary.nextActionAt ? (
              <p className={"mt-1 flex items-center gap-1.5 text-sm " + (overdue ? "text-[#f87171]" : "text-text")}>
                <CalendarClock className="size-4" />
                {formatDateTime(summary.nextActionAt)}
                {overdue && <Badge tone="red">{tr.progress.overdue}</Badge>}
              </p>
            ) : (
              <p className="mt-1 text-sm text-muted">{tr.progress.noFollowUp}</p>
            )}
            <p className="mt-0.5 text-xs text-muted">{tr.progress.attempts(summary.attempts)}</p>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={tr.progress.timelineTitle} />
        <CardBody>
          {error && <p className="text-sm text-[#f87171]">{error instanceof Error ? error.message : tr.common.error}</p>}
          {loading && <p className="text-sm text-muted">{tr.common.loading}</p>}
          {!loading && events.length === 0 && <p className="text-sm text-muted">{tr.progress.empty}</p>}
          <ol className="relative space-y-4 border-l border-border pl-5">
            {events.map((event) => (
              <li key={`${event.kind}:${event.id}`} className="relative">
                <EventDot kind={event.kind} />
                <EventBody event={event} nameOf={nameOf} />
              </li>
            ))}
          </ol>
        </CardBody>
      </Card>
    </div>
  );
}

function EventDot({ kind }: { kind: ProgressEvent["kind"] }) {
  const Icon = { contact: Phone, stage: Workflow, note: StickyNote, message: MessageSquareReply, reply: MessageSquareReply }[kind];
  return (
    <span className="absolute top-0.5 -left-[31px] flex size-5 items-center justify-center rounded-full border border-border bg-surface-2 text-muted">
      <Icon className="size-3" />
    </span>
  );
}

function EventBody({ event, nameOf }: { event: ProgressEvent; nameOf: (userId: string | null) => string }) {
  const when = formatDateTime(event.at);
  switch (event.kind) {
    case "contact": {
      const { attempt } = event;
      return (
        <>
          <div className="flex flex-wrap items-center gap-2 text-sm text-text">
            <ChannelIcon channel={attempt.channel} />
            <span>{tr.channels[attempt.channel as keyof typeof tr.channels] ?? attempt.channel}</span>
            <span className="text-muted">{attempt.address}</span>
            <Badge tone={OUTCOME_TONES[attempt.outcome]}>{tr.contactOutcome.outcomes[attempt.outcome]}</Badge>
          </div>
          <p className="mt-1 text-xs text-muted">
            {nameOf(attempt.created_by)} · {when}
            {attempt.follow_up_at ? ` · ${tr.progress.followUpAt(formatDateTime(attempt.follow_up_at))}` : ""}
            {attempt.note ? ` · ${attempt.note}` : ""}
          </p>
        </>
      );
    }
    case "stage": {
      const { transition } = event;
      return (
        <>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {transition.from_stage && <StageBadge stage={transition.from_stage} />}
            {transition.from_stage && <span className="text-subtle">→</span>}
            <StageBadge stage={transition.to_stage} />
          </div>
          <p className="mt-1 text-xs text-muted">
            {tr.actorTypes[transition.actor_type as keyof typeof tr.actorTypes] ?? transition.actor_type} · {when}
            {transition.reason ? ` · ${transition.reason}` : ""}
          </p>
        </>
      );
    }
    case "note":
      return (
        <>
          <p className="text-sm whitespace-pre-wrap text-text">{event.note.body}</p>
          <p className="mt-1 text-xs text-muted">
            {tr.progress.note} · {nameOf(event.note.author_id)} · {when}
          </p>
        </>
      );
    case "message":
      return (
        <p className="text-sm text-text">
          {tr.progress.messageSent(tr.channels[event.message.channel as keyof typeof tr.channels] ?? event.message.channel)}
          <span className="block text-xs text-muted">{when}</span>
        </p>
      );
    case "reply":
      return (
        <p className="text-sm text-[#4ade80]">
          {tr.progress.replyReceived(tr.channels[event.message.channel as keyof typeof tr.channels] ?? event.message.channel)}
          <span className="block text-xs text-muted">{when}</span>
        </p>
      );
  }
}
