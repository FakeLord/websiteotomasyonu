import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, Loader2, MessagesSquare, Pause, Pencil, Play, SkipForward, Sparkles, Trash2, Undo2, UserPlus } from "lucide-react";
import { OUTREACH_LANGUAGES, type OutreachChannel, type OutreachLanguage } from "@lbf/core";
import { supabase } from "../../lib/supabase-client";
import { useWorkspaceMembership } from "../../lib/use-workspace-membership";
import { useRealtimeTable } from "../../lib/use-realtime-table";
import { formatRelative } from "../../lib/format";
import { tr } from "../../i18n/tr";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Avatar, EmptyState, Progress, StatCard, Table, Td, Th, Tr } from "../../components/ui/data-display";
import { ChannelIcon } from "../../components/domain/channel-icon";
import { ScoreBadge, WebsiteStatusBadge } from "../../components/domain/badges";
import { draftReasonLabel } from "../leads/detail/lead-data";
import { ensureConversation, generateFirstMessageDraft, rpc, saveDraftToConversation } from "../outreach/outreach";
import { CAMPAIGN_STATUS_TONES } from "./CampaignsPage";
import { EditCampaignDialog } from "./EditCampaignDialog";
import { EMPTY_STATS, describeSegment, replyRate, useCampaigns, type CampaignStatus } from "./campaign-data";

interface MemberRow {
  id: string;
  status: "QUEUED" | "DRAFTED" | "SENT" | "REPLIED" | "SKIPPED";
  skip_reason: string | null;
  sent_at: string | null;
  replied_at: string | null;
  business_id: string;
  businesses: {
    id: string;
    name: string;
    category: string | null;
    district: string | null;
    city: string | null;
    lead_score: number;
    website_status: string | null;
    do_not_contact: boolean;
  } | null;
}

const MEMBER_TONES = { QUEUED: "gray", DRAFTED: "navy", SENT: "blue", REPLIED: "green", SKIPPED: "orange" } as const;

export function CampaignDetailPage() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceMembership().data?.workspaceId;
  const { campaigns, stats } = useCampaigns();
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [messages, setMessages] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  // Bilerek varsayılan yok: taslakların dilini ekip seçer.
  const [language, setLanguage] = useState<OutreachLanguage | "">("");
  const membersKey = ["campaign-members", campaignId];
  useRealtimeTable("campaign_members", workspaceId, membersKey);

  const campaign = campaigns.data?.find((c) => c.id === campaignId);
  const s = (campaignId && stats.data?.[campaignId]) || EMPTY_STATS;

  const members = useQuery({
    queryKey: membersKey,
    enabled: !!campaignId,
    queryFn: async (): Promise<MemberRow[]> => {
      const { data, error: qError } = await supabase
        .from("campaign_members")
        .select("id, status, skip_reason, sent_at, replied_at, business_id, businesses(id, name, category, district, city, lead_score, website_status, do_not_contact)")
        .eq("campaign_id", campaignId as string)
        .order("added_at", { ascending: true });
      if (qError) throw qError;
      return (data ?? []) as unknown as MemberRow[];
    },
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: membersKey });
    void queryClient.invalidateQueries({ queryKey: ["campaign-stats", workspaceId] });
    void queryClient.invalidateQueries({ queryKey: ["campaigns", workspaceId] });
  };
  const onError = (err: unknown) => setError(err instanceof Error ? err.message : tr.common.error);

  const setStatus = useMutation({
    mutationFn: (status: CampaignStatus) => rpc("set_campaign_status", { p_campaign_id: campaignId, p_status: status }),
    onSuccess: refresh,
    onError,
  });

  const deleteCampaign = useMutation({
    mutationFn: () => rpc("delete_campaign", { p_campaign_id: campaignId }),
    onSuccess: () => {
      refresh();
      navigate("/campaigns", { replace: true });
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : tr.common.error;
      setError(message.includes("contacted members") ? tr.campaigns.edit.deleteBlocked : message);
    },
  });

  const populate = useMutation({
    mutationFn: () => rpc<number>("populate_campaign_members", { p_campaign_id: campaignId, p_limit: 500 }),
    onSuccess: (added) => {
      setMessages([tr.campaigns.membersAdded(added)]);
      refresh();
    },
    onError,
  });

  const memberStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "QUEUED" | "SKIPPED" }) =>
      rpc("set_campaign_member_status", { p_member_id: id, p_status: status, p_skip_reason: null }),
    onSuccess: refresh,
    onError,
  });

  const prepareDrafts = async (targets: MemberRow[]) => {
    if (!workspaceId || !campaign) return;
    if (!language) {
      setError(tr.draft.selectLanguageFirst);
      return;
    }
    setError(null);
    setMessages([]);
    setProgress({ done: 0, total: targets.length });
    const notes: string[] = [];
    for (const [index, member] of targets.entries()) {
      const business = member.businesses;
      if (!business) continue;
      try {
        const draft = await generateFirstMessageDraft(workspaceId, business, campaign.channel as OutreachChannel, language);
        if (!draft.ok) {
          notes.push(`${business.name}: ${draft.reasons.map(draftReasonLabel).join(", ")}`);
        } else {
          await saveDraftToConversation(workspaceId, business.id, {
            channel: campaign.channel,
            subject: draft.subject,
            body: draft.body,
            authorType: "AI",
          });
          await rpc("set_campaign_member_status", { p_member_id: member.id, p_status: "DRAFTED", p_skip_reason: null });
        }
      } catch (err) {
        notes.push(`${business.name}: ${err instanceof Error ? err.message : tr.common.error}`);
      }
      setProgress({ done: index + 1, total: targets.length });
    }
    setProgress(null);
    setMessages(notes.length ? [tr.campaigns.someFailed, ...notes] : [tr.campaigns.draftsReady(targets.length)]);
    refresh();
  };

  const openConversation = async (member: MemberRow) => {
    if (!workspaceId || !campaign) return;
    const id = await ensureConversation(workspaceId, member.business_id, campaign.channel);
    navigate(`/conversations?c=${id}`);
  };

  if (!campaign) return <p className="text-sm text-muted">{campaigns.isPending ? tr.common.loading : tr.campaigns.notFound}</p>;

  const queued = (members.data ?? []).filter((m) => m.status === "QUEUED");
  const nextBatch = queued.slice(0, campaign.daily_limit);
  const progressValue = s.total > 0 ? ((s.sent + s.skipped) / s.total) * 100 : 0;

  return (
    <div className="space-y-5">
      <button type="button" onClick={() => navigate("/campaigns")} className="flex items-center gap-1.5 text-sm text-muted hover:text-text">
        <ArrowLeft className="size-4" />
        {tr.campaigns.backToList}
      </button>

      <Card className="p-5">
        <div className="flex flex-wrap items-start gap-4">
          <ChannelIcon channel={campaign.channel} boxed className="size-12" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-text">{campaign.name}</h1>
              <Badge tone={CAMPAIGN_STATUS_TONES[campaign.status]}>{tr.campaigns.statuses[campaign.status]}</Badge>
            </div>
            <p className="mt-1 text-sm text-muted">
              {describeSegment(campaign.segment, { minScore: tr.campaigns.minScoreShort, websiteStatus: tr.websiteAnalysis.statusShort }) ||
                tr.campaigns.allLeads}
            </p>
            {campaign.description && <p className="mt-2 max-w-2xl text-sm text-text">{campaign.description}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            {campaign.status !== "COMPLETED" && (
              <Button variant="ghost" onClick={() => setEditOpen(true)}>
                <Pencil />
                {tr.campaigns.edit.open}
              </Button>
            )}
            <Button
              variant="ghost"
              disabled={deleteCampaign.isPending}
              onClick={() => {
                if (window.confirm(tr.campaigns.edit.deleteConfirm(campaign.name))) deleteCampaign.mutate();
              }}
            >
              <Trash2 />
              {tr.campaigns.edit.delete}
            </Button>
            {campaign.status === "DRAFT" && (
              <Button onClick={() => setStatus.mutate("ACTIVE")}>
                <Play />
                {tr.campaigns.start}
              </Button>
            )}
            {campaign.status === "ACTIVE" && (
              <Button variant="outline" onClick={() => setStatus.mutate("PAUSED")}>
                <Pause />
                {tr.campaigns.pause}
              </Button>
            )}
            {campaign.status === "PAUSED" && (
              <Button onClick={() => setStatus.mutate("ACTIVE")}>
                <Play />
                {tr.campaigns.resume}
              </Button>
            )}
            {(campaign.status === "ACTIVE" || campaign.status === "PAUSED") && (
              <Button variant="outline" onClick={() => setStatus.mutate("COMPLETED")}>
                <CheckCircle2 />
                {tr.campaigns.complete}
              </Button>
            )}
          </div>
        </div>
        <div className="mt-5 space-y-1.5">
          <div className="flex justify-between text-xs text-muted">
            <span>{tr.campaigns.progress}</span>
            <span className="text-text tabular-nums">%{Math.round(progressValue)}</span>
          </div>
          <Progress value={progressValue} />
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label={tr.campaigns.members} value={s.total} icon={UserPlus} />
        <StatCard label={tr.campaigns.waiting} value={s.queued} icon={SkipForward} />
        <StatCard label={tr.campaigns.drafted} value={s.drafted} icon={Sparkles} />
        <StatCard label={tr.campaigns.sent} value={s.sent} icon={MessagesSquare} />
        <StatCard label={tr.campaigns.replyRate} value={`%${replyRate(s)}`} icon={CheckCircle2} />
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <h2 className="mr-auto text-sm font-semibold text-text">{tr.campaigns.memberList}</h2>
          {progress && (
            <span className="flex items-center gap-2 text-xs text-muted">
              <Loader2 className="size-3.5 animate-spin" />
              {tr.campaigns.preparing(progress.done, progress.total)}
            </span>
          )}
          <Button variant="outline" size="sm" disabled={populate.isPending || campaign.status === "COMPLETED"} onClick={() => populate.mutate()}>
            <UserPlus />
            {tr.campaigns.refill}
          </Button>
          <label className="flex items-center gap-2 text-xs text-muted">
            {tr.draft.languageLabel}
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as OutreachLanguage | "")}
              className="rounded-md border border-border bg-surface-2 px-2 py-1 text-sm text-text"
            >
              <option value="">{tr.draft.languagePlaceholder}</option>
              {OUTREACH_LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {tr.draft.languages[l]}
                </option>
              ))}
            </select>
          </label>
          <Button
            size="sm"
            variant="default"
            disabled={!!progress || nextBatch.length === 0 || campaign.status !== "ACTIVE" || !language}
            onClick={() => void prepareDrafts(nextBatch)}
            title={campaign.status !== "ACTIVE" ? tr.campaigns.startFirst : undefined}
          >
            <Sparkles />
            {tr.campaigns.prepareNext(nextBatch.length)}
          </Button>
        </div>
        {campaign.status !== "ACTIVE" && campaign.status !== "COMPLETED" && (
          <p className="border-b border-border px-3 py-2 text-xs text-warning">{tr.campaigns.startFirst}</p>
        )}
        {(messages.length > 0 || error) && (
          <div className="space-y-0.5 border-b border-border px-3 py-2 text-xs">
            {error && <p className="text-danger">{error}</p>}
            {messages.map((m) => (
              <p key={m} className="text-muted">
                {m}
              </p>
            ))}
          </div>
        )}
        <p className="border-b border-border px-3 py-2 text-xs text-subtle">{tr.campaigns.sendingNote}</p>

        {(members.data ?? []).length === 0 ? (
          <EmptyState icon={UserPlus} title={tr.campaigns.noMembers} description={tr.campaigns.noMembersHint} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{tr.leads.columns.name}</Th>
                <Th>{tr.leads.columns.website}</Th>
                <Th>{tr.leads.columns.score}</Th>
                <Th>{tr.leads.columns.status}</Th>
                <Th>{tr.campaigns.lastEvent}</Th>
                <Th className="w-48">
                  <span className="sr-only">{tr.common.actions}</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {(members.data ?? []).map((member) => (
                <Tr key={member.id}>
                  <Td>
                    <button type="button" className="flex items-center gap-3 text-left" onClick={() => navigate(`/leads/${member.business_id}`)}>
                      <Avatar name={member.businesses?.name ?? "?"} size="sm" square />
                      <span>
                        <span className="block max-w-64 truncate font-medium text-text">{member.businesses?.name}</span>
                        <span className="block text-xs text-muted">{[member.businesses?.category, member.businesses?.district].filter(Boolean).join(" · ")}</span>
                      </span>
                    </button>
                  </Td>
                  <Td>
                    <WebsiteStatusBadge status={member.businesses?.website_status ?? null} />
                  </Td>
                  <Td>
                    <ScoreBadge score={member.businesses?.lead_score ?? null} />
                  </Td>
                  <Td>
                    <Badge tone={MEMBER_TONES[member.status]}>{tr.campaigns.memberStatuses[member.status]}</Badge>
                  </Td>
                  <Td className="text-muted">
                    {member.replied_at ? formatRelative(member.replied_at) : member.sent_at ? formatRelative(member.sent_at) : "—"}
                  </Td>
                  <Td>
                    <div className="flex justify-end gap-1">
                      {member.status === "QUEUED" && campaign.status === "ACTIVE" && (
                        <Button size="sm" variant="outline" disabled={!!progress || !language} onClick={() => void prepareDrafts([member])}>
                          <Sparkles />
                          {tr.campaigns.prepare}
                        </Button>
                      )}
                      {member.status !== "QUEUED" && member.status !== "SKIPPED" && (
                        <Button size="sm" variant="outline" onClick={() => void openConversation(member)}>
                          <MessagesSquare />
                          {tr.campaigns.openConversation}
                        </Button>
                      )}
                      {(member.status === "QUEUED" || member.status === "DRAFTED") && (
                        <Button size="sm" variant="ghost" onClick={() => memberStatus.mutate({ id: member.id, status: "SKIPPED" })}>
                          <SkipForward />
                        </Button>
                      )}
                      {member.status === "SKIPPED" && (
                        <Button size="sm" variant="ghost" onClick={() => memberStatus.mutate({ id: member.id, status: "QUEUED" })}>
                          <Undo2 />
                          {tr.campaigns.requeue}
                        </Button>
                      )}
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      {editOpen && <EditCampaignDialog campaign={campaign} onClose={() => setEditOpen(false)} />}
    </div>
  );
}
