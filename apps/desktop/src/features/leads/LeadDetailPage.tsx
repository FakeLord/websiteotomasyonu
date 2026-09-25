import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  allowedNextStages,
  chooseChannel,
  type BusinessStage,
  type Channel,
  type ChannelMode,
  type RoutingChannelCandidate,
} from "@lbf/core";
import { supabase } from "../../lib/supabase-client";
import { useWorkspaceMembership } from "../../lib/use-workspace-membership";
import { analyzeBusiness } from "../../workers/website-analysis-runner";
import { tr } from "../../i18n/tr";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import type { BusinessDetail } from "./types";

interface WorkspaceRoutingSettings {
  channel_priority: Channel[];
  channel_modes: Record<Channel, ChannelMode>;
  outreach_limits: { daily_total: number; channels: Record<string, number>; channel_cooldown_hours: number };
}

function RecommendedChannelCard({ business, workspaceId }: { business: BusinessDetail; workspaceId: string }) {
  const query = useQuery({
    queryKey: ["recommended-channel", business.id],
    queryFn: async () => {
      const [{ data: channels, error: channelsError }, { data: settings, error: settingsError }] = await Promise.all([
        supabase
          .from("contact_channels")
          .select("channel, status, confidence")
          .eq("business_id", business.id),
        supabase
          .from("workspace_settings")
          .select("channel_priority, channel_modes, outreach_limits")
          .eq("workspace_id", workspaceId)
          .single(),
      ]);
      if (channelsError) throw channelsError;
      if (settingsError) throw settingsError;

      const typedSettings = settings as unknown as WorkspaceRoutingSettings;
      const candidates: RoutingChannelCandidate[] = (channels ?? []).map((c) => ({
        channel: c.channel as Channel,
        status: c.status as RoutingChannelCandidate["status"],
        confidence: Number(c.confidence),
      }));

      return chooseChannel({
        doNotContact: business.do_not_contact,
        candidates,
        settings: {
          channelPriority: typedSettings.channel_priority,
          channelModes: typedSettings.channel_modes,
        },
        history: {
          lastMessageAtByChannel: {},
          firstMessageChannelWithin30Days: null,
          dailyCountByChannel: {},
          dailyCountTotal: 0,
        },
        limits: {
          dailyTotal: typedSettings.outreach_limits.daily_total,
          dailyByChannel: typedSettings.outreach_limits.channels as Partial<Record<Channel, number>>,
          channelCooldownHours: typedSettings.outreach_limits.channel_cooldown_hours,
        },
        now: new Date(),
      });
    },
  });

  if (!query.data) return null;
  const result = query.data;

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="mb-2 text-sm font-semibold text-slate-700">{tr.routing.title}</h2>
      {result.ok ? (
        <p className="text-sm">
          <span className="font-medium text-slate-900">{result.channel}</span>{" "}
          <span className="text-slate-500">({result.mode})</span>
        </p>
      ) : result.doNotContact ? (
        <p className="text-xs text-red-600">{tr.routing.doNotContact}</p>
      ) : (
        <p className="text-xs text-slate-400">{tr.routing.noChannel}</p>
      )}
    </section>
  );
}

interface WebsiteAnalysisRow {
  id: string;
  status: "NO_WEBSITE" | "BROKEN_WEBSITE" | "LOW_QUALITY_WEBSITE" | "GOOD_WEBSITE";
  issues: string[];
  created_at: string;
}

const STALE_DAYS = 30;

function WebsiteAnalysisSection({ business, workspaceId }: { business: BusinessDetail; workspaceId: string }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const analysisQuery = useQuery({
    queryKey: ["website-analysis", business.id],
    queryFn: async (): Promise<WebsiteAnalysisRow | null> => {
      const { data, error: queryError } = await supabase
        .from("website_analyses")
        .select("id, status, issues, created_at")
        .eq("business_id", business.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (queryError) throw queryError;
      return data as WebsiteAnalysisRow | null;
    },
  });

  const analyzeMutation = useMutation({
    mutationFn: async () => {
      await analyzeBusiness(workspaceId, {
        id: business.id,
        websiteUrl: business.website_url,
        category: business.category,
      });
    },
    onSuccess: () => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ["website-analysis", business.id] });
      void queryClient.invalidateQueries({ queryKey: ["business", business.id] });
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : tr.websiteAnalysis.analyzeError);
    },
  });

  const analysis = analysisQuery.data;
  const isStale = analysis
    ? Date.now() - new Date(analysis.created_at).getTime() > STALE_DAYS * 24 * 60 * 60 * 1000
    : false;

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">{tr.websiteAnalysis.title}</h2>
        <Button
          size="sm"
          variant="outline"
          disabled={analyzeMutation.isPending}
          onClick={() => analyzeMutation.mutate()}
        >
          {analyzeMutation.isPending
            ? tr.websiteAnalysis.analyzing
            : analysis
              ? tr.websiteAnalysis.reanalyzeButton
              : tr.websiteAnalysis.analyzeButton}
        </Button>
      </div>

      {error && <p className="mb-2 text-xs text-red-600">{error}</p>}

      {!analysis && !analyzeMutation.isPending && (
        <p className="text-xs text-slate-400">{tr.websiteAnalysis.neverAnalyzed}</p>
      )}

      {analysis && (
        <div className="space-y-2 text-sm">
          <p>
            <span className="text-slate-500">{tr.websiteAnalysis.statusLabel}: </span>
            <span className="font-medium text-slate-900">{tr.websiteAnalysis.status[analysis.status]}</span>
          </p>
          <p className="text-xs text-slate-400">
            {tr.websiteAnalysis.lastAnalyzedAt}: {new Date(analysis.created_at).toLocaleString("tr-TR")}
          </p>
          {isStale && <p className="text-xs text-amber-600">{tr.websiteAnalysis.staleWarning}</p>}
          <div>
            <p className="mb-1 text-xs font-medium text-slate-600">{tr.websiteAnalysis.issuesTitle}</p>
            {analysis.issues.length === 0 ? (
              <p className="text-xs text-slate-400">{tr.websiteAnalysis.noIssues}</p>
            ) : (
              <ul className="list-inside list-disc space-y-1 text-xs text-slate-600">
                {analysis.issues.map((issue, idx) => (
                  <li key={idx}>{issue}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

interface NoteRow {
  id: string;
  body: string;
  created_at: string;
  author_id: string;
}

interface StageTransitionRow {
  id: string;
  from_stage: string | null;
  to_stage: string;
  reason: string | null;
  actor_type: string;
  created_at: string;
}

export function LeadDetailPage() {
  const { businessId } = useParams<{ businessId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const membership = useWorkspaceMembership();
  const [noteBody, setNoteBody] = useState("");

  const businessQuery = useQuery({
    queryKey: ["business", businessId],
    enabled: !!businessId,
    queryFn: async (): Promise<BusinessDetail> => {
      const { data, error } = await supabase
        .from("businesses")
        .select("*")
        .eq("id", businessId as string)
        .single();
      if (error) throw error;
      return data as BusinessDetail;
    },
  });

  const duplicateTargetQuery = useQuery({
    queryKey: ["business", businessQuery.data?.possible_duplicate_of],
    enabled: !!businessQuery.data?.possible_duplicate_of,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("businesses")
        .select("id, name")
        .eq("id", businessQuery.data?.possible_duplicate_of as string)
        .single();
      if (error) throw error;
      return data as { id: string; name: string };
    },
  });

  const notesQuery = useQuery({
    queryKey: ["notes", businessId],
    enabled: !!businessId,
    queryFn: async (): Promise<NoteRow[]> => {
      const { data, error } = await supabase
        .from("notes")
        .select("id, body, created_at, author_id")
        .eq("business_id", businessId as string)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as NoteRow[];
    },
  });

  const timelineQuery = useQuery({
    queryKey: ["stage-transitions", businessId],
    enabled: !!businessId,
    queryFn: async (): Promise<StageTransitionRow[]> => {
      const { data, error } = await supabase
        .from("stage_transitions")
        .select("id, from_stage, to_stage, reason, actor_type, created_at")
        .eq("business_id", businessId as string)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as StageTransitionRow[];
    },
  });

  const invalidateBusiness = () => {
    void queryClient.invalidateQueries({ queryKey: ["business", businessId] });
    void queryClient.invalidateQueries({ queryKey: ["stage-transitions", businessId] });
  };

  const transitionMutation = useMutation({
    mutationFn: async (toStage: BusinessStage) => {
      if (!businessQuery.data) return;
      const { error } = await supabase.rpc("transition_stage", {
        p_business_id: businessQuery.data.id,
        p_to_stage: toStage,
        p_reason: null,
        p_expected_version: businessQuery.data.version,
      });
      if (error) throw error;
    },
    onSuccess: invalidateBusiness,
  });

  const dncMutation = useMutation({
    mutationFn: async (value: boolean) => {
      let reason: string | null = null;
      if (!value) {
        reason = window.prompt(tr.leads.dncReasonPrompt) ?? "";
        if (!reason.trim()) return;
      }
      const { error } = await supabase.rpc("set_dnc", {
        p_business_id: businessId,
        p_value: value,
        p_reason: reason,
      });
      if (error) throw error;
    },
    onSuccess: invalidateBusiness,
  });

  const mergeMutation = useMutation({
    mutationFn: async (keepId: string) => {
      const { error } = await supabase.rpc("merge_businesses", {
        p_keep_id: keepId,
        p_drop_id: businessId,
      });
      if (error) throw error;
      return keepId;
    },
    onSuccess: (keepId) => {
      if (keepId) navigate(`/leads/${keepId}`, { replace: true });
    },
  });

  const addNoteMutation = useMutation({
    mutationFn: async (body: string) => {
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase.from("notes").insert({
        workspace_id: businessQuery.data?.id ? membership.data?.workspaceId : undefined,
        business_id: businessId,
        author_id: userData.user?.id,
        body,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setNoteBody("");
      void queryClient.invalidateQueries({ queryKey: ["notes", businessId] });
    },
  });

  if (businessQuery.isPending || !businessQuery.data) {
    return <p className="text-sm text-slate-500">{tr.common.loading}</p>;
  }

  const business = businessQuery.data;
  const nextStages = allowedNextStages(business.stage);

  return (
    <div className="space-y-6">
      <button
        type="button"
        onClick={() => navigate("/leads")}
        className="text-sm text-slate-500 hover:underline"
      >
        ← {tr.leads.backToList}
      </button>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{business.name}</h1>
          <p className="text-sm text-slate-500">
            {[business.city, business.district].filter(Boolean).join(" / ")} · {business.category ?? "—"}
          </p>
        </div>
        <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-medium text-white">
          {tr.stages[business.stage]}
        </span>
      </div>

      {business.possible_duplicate_of && duplicateTargetQuery.data && (
        <div className="flex items-center justify-between rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <span>
            {tr.leads.possibleDuplicateBanner} ({duplicateTargetQuery.data.name})
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              if (window.confirm(tr.leads.mergeConfirm)) {
                mergeMutation.mutate(duplicateTargetQuery.data!.id);
              }
            }}
          >
            {tr.leads.mergeButton}
          </Button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-4">
          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="mb-2 text-sm font-semibold text-slate-700">Bilgiler</h2>
            <dl className="space-y-1 text-sm">
              <Row label={tr.leads.phoneLabel} value={business.primary_phone_e164} />
              <Row label={tr.leads.websiteLabel} value={business.website_url} />
              <Row
                label={tr.websiteAnalysis.statusLabel}
                value={business.website_status ? tr.websiteAnalysis.status[business.website_status] : null}
              />
              <Row label={tr.leads.columns.score} value={String(business.lead_score)} />
            </dl>
          </section>

          {membership.data?.workspaceId && (
            <>
              <WebsiteAnalysisSection business={business} workspaceId={membership.data.workspaceId} />
              <RecommendedChannelCard business={business} workspaceId={membership.data.workspaceId} />
            </>
          )}

          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="mb-2 text-sm font-semibold text-slate-700">Aşama</h2>
            <div className="flex flex-wrap gap-2">
              {nextStages.length === 0 && <p className="text-xs text-slate-400">Sonraki aşama yok.</p>}
              {nextStages.map((stage) => (
                <Button
                  key={stage}
                  size="sm"
                  variant="outline"
                  disabled={transitionMutation.isPending}
                  onClick={() => transitionMutation.mutate(stage)}
                >
                  {tr.stages[stage]}
                </Button>
              ))}
            </div>
            <div className="mt-3">
              <Button
                size="sm"
                variant={business.do_not_contact ? "outline" : "default"}
                disabled={dncMutation.isPending}
                onClick={() => dncMutation.mutate(!business.do_not_contact)}
              >
                {business.do_not_contact ? tr.leads.dncToggleOff : tr.leads.dncToggleOn}
              </Button>
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="mb-2 text-sm font-semibold text-slate-700">{tr.leads.timelineTitle}</h2>
            <ul className="space-y-2 text-xs text-slate-600">
              {timelineQuery.data?.map((t) => (
                <li key={t.id}>
                  <span className="font-medium">{t.from_stage ?? "—"} → {t.to_stage}</span>{" "}
                  <span className="text-slate-400">
                    ({t.actor_type}, {new Date(t.created_at).toLocaleString("tr-TR")})
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-700">{tr.leads.notesTitle}</h2>
          <div className="flex gap-2">
            <Input
              value={noteBody}
              onChange={(e) => setNoteBody(e.target.value)}
              placeholder={tr.leads.addNotePlaceholder}
            />
            <Button
              size="sm"
              disabled={!noteBody.trim() || addNoteMutation.isPending}
              onClick={() => addNoteMutation.mutate(noteBody.trim())}
            >
              {tr.leads.addNoteButton}
            </Button>
          </div>
          <ul className="space-y-3">
            {notesQuery.data?.map((note) => (
              <li key={note.id} className="rounded-md bg-slate-50 p-2 text-sm">
                <p className="text-slate-800">{note.body}</p>
                <p className="mt-1 text-xs text-slate-400">
                  {new Date(note.created_at).toLocaleString("tr-TR")}
                </p>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right text-slate-800">{value ?? "—"}</dd>
    </div>
  );
}
