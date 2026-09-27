import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ScoringRules } from "@lbf/core";
import { supabase } from "../../lib/supabase-client";
import { recomputeAllScores } from "../../workers/score-runner";
import { tr } from "../../i18n/tr";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";

interface WorkspaceSettingsRow {
  scoring_rules: ScoringRules;
  channel_priority: string[];
  outreach_limits: {
    daily_total: number;
    channels: Record<string, number>;
    channel_cooldown_hours: number;
    places_monthly_cap: number | null;
  };
}

const RULE_KEYS = [
  "NO_WEBSITE",
  "BROKEN_WEBSITE",
  "LOW_QUALITY_WEBSITE",
  "GOOD_WEBSITE",
  "NO_BOOKING",
  "NO_CONTACT_FORM",
  "HIGH_RATING",
  "HIGH_REVIEW_COUNT",
  "RUNS_ADS",
  "HAS_INSTAGRAM",
  "HAS_EMAIL",
  "HAS_WHATSAPP_MOBILE",
  "HAS_PHONE",
  "NO_CONTACT_CHANNEL",
] as const;

const CHANNELS = ["EMAIL", "INSTAGRAM", "FACEBOOK", "WHATSAPP", "LINKEDIN", "TIKTOK"] as const;

export function ScoringSettingsSection({ workspaceId }: { workspaceId: string }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<WorkspaceSettingsRow | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);

  const settingsQuery = useQuery({
    queryKey: ["workspace-settings-scoring", workspaceId],
    queryFn: async (): Promise<WorkspaceSettingsRow> => {
      const { data, error } = await supabase
        .from("workspace_settings")
        .select("scoring_rules, channel_priority, outreach_limits")
        .eq("workspace_id", workspaceId)
        .single();
      if (error) throw error;
      return data as WorkspaceSettingsRow;
    },
  });

  useEffect(() => {
    if (settingsQuery.data && !draft) setDraft(settingsQuery.data);
  }, [settingsQuery.data, draft]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!draft) return;
      const nextVersion = draft.scoring_rules.version + 1;
      const nextRules: ScoringRules = { ...draft.scoring_rules, version: nextVersion };
      const { error } = await supabase
        .from("workspace_settings")
        .update({
          scoring_rules: nextRules,
          channel_priority: draft.channel_priority,
          outreach_limits: draft.outreach_limits,
        })
        .eq("workspace_id", workspaceId);
      if (error) throw error;
      return nextRules;
    },
    onSuccess: async (nextRules) => {
      setMessage(tr.settings.saveSuccess);
      void queryClient.invalidateQueries({ queryKey: ["workspace-settings-scoring", workspaceId] });
      if (nextRules) {
        setBulkProgress({ done: 0, total: 0 });
        await recomputeAllScores(workspaceId, (done, total) => setBulkProgress({ done, total }));
        setBulkProgress(null);
        void queryClient.invalidateQueries({ queryKey: ["businesses", workspaceId] });
      }
    },
    onError: (err) => {
      setMessage(err instanceof Error ? err.message : tr.settings.saveError);
    },
  });

  if (!draft) {
    return <p className="text-sm text-muted">{tr.common.loading}</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-text">{tr.settings.scoringTitle}</h2>
        <p className="text-sm text-muted">{tr.settings.scoringDescription}</p>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-medium text-text">{tr.settings.scoringRulesTitle}</h3>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {RULE_KEYS.map((key) => (
            <label key={key} className="flex items-center justify-between gap-2 rounded-lg bg-surface-2 px-3 py-2 text-sm text-text">
              <span>{tr.scoreRules[key]}</span>
              <Input
                type="number"
                className="h-7 w-16 text-right"
                value={draft.scoring_rules.rules[key] ?? 0}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    scoring_rules: {
                      ...draft.scoring_rules,
                      rules: { ...draft.scoring_rules.rules, [key]: Number(e.target.value) },
                    },
                  })
                }
              />
            </label>
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-medium text-text">{tr.settings.channelPriorityTitle}</h3>
        <div className="flex flex-wrap gap-2">
          {draft.channel_priority.map((channel, idx) => (
            <span key={channel} className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-sm text-text">
              {idx + 1}. {tr.channels[channel as keyof typeof tr.channels] ?? channel}
              <button
                type="button"
                disabled={idx === 0}
                className="text-muted hover:text-text disabled:opacity-30"
                onClick={() => {
                  const next = [...draft.channel_priority];
                  [next[idx - 1], next[idx]] = [next[idx]!, next[idx - 1]!];
                  setDraft({ ...draft, channel_priority: next });
                }}
              >
                ↑
              </button>
              <button
                type="button"
                disabled={idx === draft.channel_priority.length - 1}
                className="text-muted hover:text-text disabled:opacity-30"
                onClick={() => {
                  const next = [...draft.channel_priority];
                  [next[idx], next[idx + 1]] = [next[idx + 1]!, next[idx]!];
                  setDraft({ ...draft, channel_priority: next });
                }}
              >
                ↓
              </button>
            </span>
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-medium text-text">{tr.settings.limitsTitle}</h3>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          <label className="flex items-center justify-between gap-2 rounded-lg bg-surface-2 px-3 py-2 text-sm text-text">
            <span>{tr.settings.dailyTotalLabel}</span>
            <Input
              type="number"
              className="h-7 w-16 text-right"
              value={draft.outreach_limits.daily_total}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  outreach_limits: { ...draft.outreach_limits, daily_total: Number(e.target.value) },
                })
              }
            />
          </label>
          <label className="flex items-center justify-between gap-2 rounded-lg bg-surface-2 px-3 py-2 text-sm text-text">
            <span>{tr.settings.cooldownLabel}</span>
            <Input
              type="number"
              className="h-7 w-16 text-right"
              value={draft.outreach_limits.channel_cooldown_hours}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  outreach_limits: { ...draft.outreach_limits, channel_cooldown_hours: Number(e.target.value) },
                })
              }
            />
          </label>
          <label className="flex items-center justify-between gap-2 rounded-lg bg-surface-2 px-3 py-2 text-sm text-text">
            <span>{tr.settings.placesMonthlyCapLabel}</span>
            <Input
              type="number"
              min={0}
              placeholder={tr.settings.unlimited}
              className="h-7 w-20 text-right"
              value={draft.outreach_limits.places_monthly_cap ?? ""}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  outreach_limits: {
                    ...draft.outreach_limits,
                    places_monthly_cap: e.target.value === "" ? null : Number(e.target.value),
                  },
                })
              }
            />
          </label>
          {CHANNELS.filter((c) => c in draft.outreach_limits.channels).map((channel) => (
            <label key={channel} className="flex items-center justify-between gap-2 rounded-lg bg-surface-2 px-3 py-2 text-sm text-text">
              <span>{tr.channels[channel]}</span>
              <Input
                type="number"
                className="h-7 w-16 text-right"
                value={draft.outreach_limits.channels[channel] ?? 0}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    outreach_limits: {
                      ...draft.outreach_limits,
                      channels: { ...draft.outreach_limits.channels, [channel]: Number(e.target.value) },
                    },
                  })
                }
              />
            </label>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button disabled={saveMutation.isPending || !!bulkProgress} onClick={() => saveMutation.mutate()}>
          {tr.settings.saveButton}
        </Button>
        {bulkProgress && (
          <span className="text-xs text-muted">
            {tr.settings.recalculatingScores(bulkProgress.done, bulkProgress.total)}
          </span>
        )}
      </div>
      {message && <p className="text-xs text-muted">{message}</p>}
    </div>
  );
}
