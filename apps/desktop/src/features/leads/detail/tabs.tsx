import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ExternalLink, Globe, Loader2, MessagesSquare, Plus, RefreshCw, StickyNote, Trash2, XCircle } from "lucide-react";
import { normalizePhone, normalizeSocial, type WebsiteChecks } from "@lbf/core";
import { supabase } from "../../../lib/supabase-client";
import { useAuthStore } from "../../../lib/auth-store";
import { useWorkspaceMembers } from "../../../lib/use-workspace-members";
import { analyzeBusiness } from "../../../workers/website-analysis-runner";
import { recomputeScore } from "../../../workers/score-runner";
import { formatDateTime, formatRelative } from "../../../lib/format";
import { tr } from "../../../i18n/tr";
import { Button } from "../../../components/ui/button";
import { Input, Select, Textarea } from "../../../components/ui/input";
import { Card, CardBody, CardHeader } from "../../../components/ui/card";
import { Badge } from "../../../components/ui/badge";
import { Avatar, EmptyState, KeyValue } from "../../../components/ui/data-display";
import { ChannelIcon } from "../../../components/domain/channel-icon";
import { StageBadge, WebsiteStatusBadge } from "../../../components/domain/badges";
import { ScoreReasons } from "./OverviewTab";
import { channelDisplayValue, channelHref, type ContactChannelRow } from "./lead-data";
import type { BusinessDetail } from "../types";

/* ---------- Web Sitesi ---------- */

interface WebsiteAnalysisRow {
  id: string;
  status: string;
  broken_reason: string | null;
  final_url: string | null;
  http_status: number | null;
  response_ms: number | null;
  pages_fetched: number;
  checks: Partial<WebsiteChecks> | null;
  issues: string[];
  created_at: string;
}

const POSITIVE_CHECKS: Array<keyof WebsiteChecks> = [
  "https",
  "responsive",
  "hasPhoneLink",
  "hasEmailLink",
  "hasWhatsappLink",
  "hasContactForm",
  "hasBookingWidget",
  "hasSocialLinks",
  "hasMetaTitle",
  "hasMetaDescription",
];
const NEGATIVE_CHECKS: Array<keyof WebsiteChecks> = ["redirectProblem", "slowResponse", "staleSignals", "mixedContent", "jsRendered"];
const STALE_MS = 30 * 24 * 60 * 60 * 1000;

export function WebsiteTab({ business, workspaceId }: { business: BusinessDetail; workspaceId: string }) {
  const queryClient = useQueryClient();
  const analysisQuery = useQuery({
    queryKey: ["website-analysis", business.id],
    queryFn: async (): Promise<WebsiteAnalysisRow | null> => {
      const { data, error } = await supabase
        .from("website_analyses")
        .select("id, status, broken_reason, final_url, http_status, response_ms, pages_fetched, checks, issues, created_at")
        .eq("business_id", business.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as WebsiteAnalysisRow | null;
    },
  });

  const analyze = useMutation({
    mutationFn: () => analyzeBusiness(workspaceId, { id: business.id, websiteUrl: business.website_url, category: business.category }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["website-analysis", business.id] });
      void queryClient.invalidateQueries({ queryKey: ["business", business.id] });
      void queryClient.invalidateQueries({ queryKey: ["contact-channels", business.id] });
    },
  });

  const analysis = analysisQuery.data;
  const isStale = analysis ? Date.now() - new Date(analysis.created_at).getTime() > STALE_MS : false;

  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <Card className="xl:col-span-1">
        <CardHeader
          title={tr.websiteAnalysis.title}
          icon={<Globe className="size-4 text-info" />}
          action={
            <Button size="sm" variant="outline" disabled={analyze.isPending} onClick={() => analyze.mutate()}>
              {analyze.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              {analysis ? tr.websiteAnalysis.reanalyzeButton : tr.websiteAnalysis.analyzeButton}
            </Button>
          }
        />
        <CardBody className="divide-y divide-border/60">
          {analyze.isError && (
            <p className="pb-2 text-sm text-danger">{analyze.error instanceof Error ? analyze.error.message : tr.websiteAnalysis.analyzeError}</p>
          )}
          {!analysis ? (
            <p className="text-sm text-muted">{tr.websiteAnalysis.neverAnalyzed}</p>
          ) : (
            <>
              <KeyValue label={tr.websiteAnalysis.statusLabel}>
                <WebsiteStatusBadge status={analysis.status} />
              </KeyValue>
              {analysis.broken_reason && (
                <KeyValue label={tr.websiteAnalysis.brokenReason}>
                  {tr.websiteAnalysis.brokenReasons[analysis.broken_reason as keyof typeof tr.websiteAnalysis.brokenReasons] ??
                    analysis.broken_reason}
                </KeyValue>
              )}
              <KeyValue label={tr.websiteAnalysis.finalUrl}>
                {analysis.final_url ? (
                  <a href={analysis.final_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                    {analysis.final_url.replace(/^https?:\/\//, "")}
                    <ExternalLink className="size-3" />
                  </a>
                ) : (
                  "—"
                )}
              </KeyValue>
              <KeyValue label={tr.websiteAnalysis.httpStatus}>{analysis.http_status ?? "—"}</KeyValue>
              <KeyValue label={tr.websiteAnalysis.responseTime}>
                {analysis.response_ms !== null ? `${analysis.response_ms} ms` : "—"}
              </KeyValue>
              <KeyValue label={tr.websiteAnalysis.pagesFetched}>{analysis.pages_fetched}</KeyValue>
              <KeyValue label={tr.websiteAnalysis.lastAnalyzedAt}>{formatDateTime(analysis.created_at)}</KeyValue>
              {isStale && <p className="pt-2 text-xs text-warning">{tr.websiteAnalysis.staleWarning}</p>}
            </>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={tr.websiteAnalysis.checksTitle} />
        <CardBody>
          {!analysis?.checks ? (
            <p className="text-sm text-muted">{tr.websiteAnalysis.noChecks}</p>
          ) : (
            <ul className="space-y-1.5">
              {POSITIVE_CHECKS.map((key) => (
                <CheckRow key={key} ok={!!analysis.checks?.[key]} label={tr.websiteAnalysis.checks[key]} />
              ))}
              {NEGATIVE_CHECKS.map((key) => (
                <CheckRow key={key} ok={!analysis.checks?.[key]} label={tr.websiteAnalysis.checks[key]} />
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={tr.websiteAnalysis.issuesTitle} />
        <CardBody>
          {!analysis || analysis.issues.length === 0 ? (
            <p className="text-sm text-muted">{tr.websiteAnalysis.noIssues}</p>
          ) : (
            <ul className="list-inside list-disc space-y-1 text-sm text-text">
              {analysis.issues.map((issue, i) => (
                <li key={i}>{issue}</li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function CheckRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2 text-sm">
      {ok ? <CheckCircle2 className="size-4 text-success" /> : <XCircle className="size-4 text-danger" />}
      <span className={ok ? "text-text" : "text-muted"}>{label}</span>
    </li>
  );
}

/* ---------- İletişim / Sosyal medya ---------- */

const ADDABLE_CHANNELS = ["EMAIL", "PHONE", "WHATSAPP", "INSTAGRAM", "FACEBOOK", "LINKEDIN", "TIKTOK"] as const;
type AddableChannel = (typeof ADDABLE_CHANNELS)[number];
export const SOCIAL_CHANNELS = ["INSTAGRAM", "FACEBOOK", "LINKEDIN", "TIKTOK"];

export function normalizeChannelValue(channel: AddableChannel, value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  switch (channel) {
    case "EMAIL":
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) ? trimmed.toLowerCase() : null;
    case "PHONE":
    case "WHATSAPP":
      return normalizePhone(trimmed)?.e164 ?? null;
    default:
      return normalizeSocial(trimmed, channel);
  }
}

export function ContactTab({
  business,
  workspaceId,
  channels,
  only,
}: {
  business: BusinessDetail;
  workspaceId: string;
  channels: ContactChannelRow[];
  only?: string[];
}) {
  const queryClient = useQueryClient();
  const allowed = (only ?? ADDABLE_CHANNELS) as AddableChannel[];
  const [channel, setChannel] = useState<AddableChannel>(allowed[0] ?? "EMAIL");
  const [value, setValue] = useState("");
  const visible = only ? channels.filter((c) => only.includes(c.channel)) : channels;

  const refresh = async () => {
    await recomputeScore(workspaceId, business.id);
    void queryClient.invalidateQueries({ queryKey: ["contact-channels", business.id] });
    void queryClient.invalidateQueries({ queryKey: ["business", business.id] });
  };

  const add = useMutation({
    mutationFn: async () => {
      const normalized = normalizeChannelValue(channel, value);
      if (!normalized) throw new Error(tr.leadDetail.invalidChannelValue);
      const { error } = await supabase.from("contact_channels").insert({
        workspace_id: workspaceId,
        business_id: business.id,
        channel,
        value: value.trim(),
        normalized_value: normalized,
        found_via: "MANUAL",
        confidence: 1,
        status: "UNVERIFIED",
      });
      if (error) throw new Error(error.code === "23505" ? tr.leadDetail.duplicateChannel : error.message);
      await refresh();
    },
    onSuccess: () => setValue(""),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("contact_channels").delete().eq("id", id);
      if (error) throw error;
      await refresh();
    },
  });

  return (
    <Card>
      <CardHeader title={only ? tr.leadDetail.tabs.social : tr.leadDetail.contactChannels} />
      <CardBody className="space-y-4">
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            add.mutate();
          }}
        >
          <Select value={channel} onChange={(e) => setChannel(e.target.value as AddableChannel)} className="w-40">
            {allowed.map((c) => (
              <option key={c} value={c}>
                {tr.channels[c]}
              </option>
            ))}
          </Select>
          <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder={tr.leadDetail.channelValuePlaceholder[channel]} className="max-w-sm flex-1" />
          <Button type="submit" disabled={!value.trim() || add.isPending}>
            <Plus />
            {tr.leadDetail.addChannel}
          </Button>
          {add.isError && <p className="w-full text-sm text-danger">{add.error instanceof Error ? add.error.message : tr.common.error}</p>}
        </form>

        {visible.length === 0 ? (
          <p className="text-sm text-muted">{tr.leadDetail.noChannels}</p>
        ) : (
          <ul className="divide-y divide-border/60">
            {visible.map((c) => {
              const href = channelHref(c);
              return (
                <li key={c.id} className="flex items-center gap-3 py-2.5">
                  <ChannelIcon channel={c.channel} boxed />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-text">{channelDisplayValue(c)}</p>
                    <p className="text-xs text-muted">
                      {tr.channels[c.channel as keyof typeof tr.channels] ?? c.channel} · {tr.foundVia[c.found_via as keyof typeof tr.foundVia] ?? c.found_via}
                    </p>
                  </div>
                  <Badge tone={c.status === "VALID" ? "green" : c.status === "UNVERIFIED" ? "gray" : "red"}>{tr.channelStatus[c.status]}</Badge>
                  {href && (
                    <a href={href} target="_blank" rel="noreferrer" className="rounded-md p-1.5 text-muted hover:bg-surface-3 hover:text-text" aria-label={tr.leadDetail.openChannel}>
                      <ExternalLink className="size-4" />
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(tr.leadDetail.removeChannelConfirm)) remove.mutate(c.id);
                    }}
                    className="rounded-md p-1.5 text-muted hover:bg-danger/15 hover:text-danger"
                    aria-label={tr.common.delete}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

/* ---------- Analiz ---------- */

interface StageTransitionRow {
  id: string;
  from_stage: string | null;
  to_stage: string;
  reason: string | null;
  actor_type: string;
  created_at: string;
}

export function AnalysisTab({ business }: { business: BusinessDetail }) {
  const timeline = useQuery({
    queryKey: ["stage-transitions", business.id],
    queryFn: async (): Promise<StageTransitionRow[]> => {
      const { data, error } = await supabase
        .from("stage_transitions")
        .select("id, from_stage, to_stage, reason, actor_type, created_at")
        .eq("business_id", business.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as StageTransitionRow[];
    },
  });

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card>
        <CardHeader title={tr.leadDetail.scoreBreakdown} />
        <CardBody className="space-y-3">
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-semibold text-text tabular-nums">{business.lead_score}</span>
            <span className="text-sm text-muted">/ 100</span>
          </div>
          <ScoreReasons business={business} />
        </CardBody>
      </Card>
      <Card>
        <CardHeader title={tr.leads.timelineTitle} />
        <CardBody>
          {timeline.data?.length === 0 && <p className="text-sm text-muted">{tr.leadDetail.noTimeline}</p>}
          <ol className="relative space-y-4 border-l border-border pl-5">
            {timeline.data?.map((t) => (
              <li key={t.id} className="relative">
                <span className="absolute top-1.5 -left-[25px] size-2.5 rounded-full border-2 border-surface bg-primary" />
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  {t.from_stage && <StageBadge stage={t.from_stage} />}
                  {t.from_stage && <span className="text-subtle">→</span>}
                  <StageBadge stage={t.to_stage} />
                </div>
                <p className="mt-1 text-xs text-muted">
                  {tr.actorTypes[t.actor_type as keyof typeof tr.actorTypes] ?? t.actor_type} · {formatDateTime(t.created_at)}
                  {t.reason ? ` · ${t.reason}` : ""}
                </p>
              </li>
            ))}
          </ol>
        </CardBody>
      </Card>
    </div>
  );
}

/* ---------- Notlar ---------- */

interface NoteRow {
  id: string;
  body: string;
  created_at: string;
  author_id: string;
}

export function NotesTab({ business, workspaceId }: { business: BusinessDetail; workspaceId: string }) {
  const queryClient = useQueryClient();
  const myId = useAuthStore((state) => state.session?.user.id);
  const { byId } = useWorkspaceMembers();
  const [body, setBody] = useState("");

  const notes = useQuery({
    queryKey: ["notes", business.id],
    queryFn: async (): Promise<NoteRow[]> => {
      const { data, error } = await supabase
        .from("notes")
        .select("id, body, created_at, author_id")
        .eq("business_id", business.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as NoteRow[];
    },
  });

  const add = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("notes").insert({ workspace_id: workspaceId, business_id: business.id, author_id: myId, body: body.trim() });
      if (error) throw error;
    },
    onSuccess: () => {
      setBody("");
      void queryClient.invalidateQueries({ queryKey: ["notes", business.id] });
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("notes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["notes", business.id] }),
  });

  return (
    <Card>
      <CardHeader title={tr.leads.notesTitle} icon={<StickyNote className="size-4 text-warning" />} />
      <CardBody className="space-y-4">
        <div className="space-y-2">
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder={tr.leads.addNotePlaceholder} rows={3} />
          <div className="flex justify-end">
            <Button disabled={!body.trim() || add.isPending} onClick={() => add.mutate()}>
              {tr.leads.addNoteButton}
            </Button>
          </div>
        </div>
        {notes.data?.length === 0 && <p className="text-sm text-muted">{tr.leadDetail.noNotes}</p>}
        <ul className="space-y-3">
          {notes.data?.map((note) => {
            const author = byId.get(note.author_id)?.name ?? "—";
            return (
              <li key={note.id} className="flex gap-3 rounded-lg bg-surface-2 p-3">
                <Avatar name={author} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted">
                    <span className="font-medium text-text">{author}</span> · {formatRelative(note.created_at)}
                  </p>
                  <p className="mt-1 text-sm whitespace-pre-wrap text-text">{note.body}</p>
                </div>
                {note.author_id === myId && (
                  <button
                    type="button"
                    onClick={() => remove.mutate(note.id)}
                    className="self-start rounded-md p-1 text-muted hover:text-danger"
                    aria-label={tr.common.delete}
                  >
                    <Trash2 className="size-4" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </CardBody>
    </Card>
  );
}

/* ---------- Konuşmalar ---------- */

interface ConversationSummaryRow {
  id: string;
  channel: string;
  status: string;
  summary: string;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  updated_at: string;
}

export function ConversationsTab({ business, onDraft }: { business: BusinessDetail; onDraft: () => void }) {
  const navigate = useNavigate();
  const conversations = useQuery({
    queryKey: ["business-conversations", business.id],
    queryFn: async (): Promise<ConversationSummaryRow[]> => {
      const { data, error } = await supabase
        .from("conversations")
        .select("id, channel, status, summary, last_inbound_at, last_outbound_at, updated_at")
        .eq("business_id", business.id)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ConversationSummaryRow[];
    },
  });

  if (conversations.data?.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={MessagesSquare}
          title={tr.leadDetail.noConversations}
          description={tr.leadDetail.noConversationsHint}
          action={<Button onClick={onDraft}>{tr.leadDetail.aiDraft}</Button>}
        />
      </Card>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {conversations.data?.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => navigate(`/conversations?c=${c.id}`)}
          className="rounded-xl border border-border bg-surface p-4 text-left transition-colors hover:border-border-strong"
        >
          <div className="flex items-center gap-3">
            <ChannelIcon channel={c.channel} boxed />
            <div className="flex-1">
              <p className="text-sm font-medium text-text">{tr.channels[c.channel as keyof typeof tr.channels] ?? c.channel}</p>
              <p className="text-xs text-muted">{formatRelative(c.updated_at)}</p>
            </div>
            <Badge tone={c.status === "OPEN" ? "green" : "gray"}>{tr.conversations.status[c.status as "OPEN" | "CLOSED"]}</Badge>
          </div>
          <p className="mt-3 line-clamp-2 text-sm text-muted">{c.summary || tr.conversations.noSummary}</p>
        </button>
      ))}
    </div>
  );
}
