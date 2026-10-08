import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Building2, FileText, Heart, MessageSquareReply, Sparkles, UserPlus, UserCheck } from "lucide-react";
import { useMarket } from "../../lib/use-market";
import { supabase } from "../../lib/supabase-client";
import { useWorkspaceMembership } from "../../lib/use-workspace-membership";
import { useMyProfile } from "../../lib/use-shell-data";
import { useUiStore } from "../../lib/ui-store";
import { formatDayLabel, percentDelta, stageSegments, useDashboardMetrics } from "../../lib/use-metrics";
import { greetingForHour } from "../../lib/format";
import { tr } from "../../i18n/tr";
import { Card, CardBody, CardHeader, CardLink } from "../../components/ui/card";
import { Select } from "../../components/ui/input";
import { StatCard } from "../../components/ui/data-display";
import { DonutChart, MultiLineChart, SERIES_COLORS } from "../../components/charts/charts";
import { RecentActivity } from "../activity-log/RecentActivity";
import { JARVIS_QUICK_PROMPTS } from "../jarvis/JarvisPanel";
import { CitySkyline } from "./CitySkyline";
import { TodayTasksCard } from "./TodayTasksCard";

interface AnalyticsSummary {
  newLeads: number;
  replied: number;
  engaged: number;
  proposalReady: number;
  customers: number;
  pendingFollowUps: number;
  overdueFollowUps: number;
}

function useAnalyticsSummary() {
  const workspaceId = useWorkspaceMembership().data?.workspaceId;
  const { market, rpcParams } = useMarket();
  return useQuery({
    queryKey: ["analytics-summary", workspaceId, market.country, market.city],
    enabled: !!workspaceId,
    queryFn: async (): Promise<AnalyticsSummary> => {
      const { data, error } = await supabase.rpc("analytics_summary", { ws: workspaceId as string, ...rpcParams });
      if (error) throw error;
      return data as AnalyticsSummary;
    },
  });
}

export function DashboardPage() {
  const navigate = useNavigate();
  const { displayName } = useMyProfile();
  const askJarvis = useUiStore((state) => state.askJarvis);
  const [days, setDays] = useState(7);
  const summary = useAnalyticsSummary().data;
  const metrics = useDashboardMetrics(days).data;

  const greeting = tr.dashboard.greeting[greetingForHour(new Date().getHours())];
  const current = metrics?.current;
  const previous = metrics?.previous;
  const delta = (key: keyof NonNullable<typeof current>) =>
    current && previous ? percentDelta(current[key], previous[key]) : null;

  const kpis = [
    { label: tr.dashboard.kpi.found, value: metrics?.totalBusinesses, icon: Building2, color: "#3b82f6", delta: delta("found"), path: "/leads" },
    { label: tr.dashboard.kpi.newLeads, value: current?.found, icon: UserPlus, color: "#22c55e", delta: delta("found"), path: "/leads?stage=NEW" },
    { label: tr.dashboard.kpi.replied, value: summary?.replied, icon: MessageSquareReply, color: "#f59e0b", delta: delta("replied"), path: "/conversations" },
    { label: tr.dashboard.kpi.engaged, value: summary?.engaged, icon: Heart, color: "#ec4899", delta: delta("engaged"), path: "/leads?stage=ENGAGED" },
    { label: tr.dashboard.kpi.proposal, value: summary?.proposalReady, icon: FileText, color: "#8b5cf6", delta: delta("proposal"), path: "/pipeline" },
    { label: tr.dashboard.kpi.customers, value: summary?.customers, icon: UserCheck, color: "#06b6d4", delta: delta("won"), path: "/customers" },
  ];

  const series = [
    { key: "found", label: tr.dashboard.series.found, color: SERIES_COLORS[0] },
    { key: "sent", label: tr.dashboard.series.sent, color: SERIES_COLORS[1] },
    { key: "replied", label: tr.dashboard.series.replied, color: SERIES_COLORS[2] },
    { key: "engaged", label: tr.dashboard.series.engaged, color: SERIES_COLORS[3] },
    { key: "won", label: tr.dashboard.series.won, color: SERIES_COLORS[4] },
  ];
  const chartData = (metrics?.series ?? []).map((row) => ({ ...row, label: formatDayLabel(row.day) }));

  return (
    <div className="grid gap-5 xl:grid-cols-3">
      <section className="relative overflow-hidden rounded-xl border border-border bg-surface xl:col-span-2">
        <div className="relative h-44">
          <CitySkyline />
          <div className="relative p-6">
            <h1 className="text-2xl font-semibold tracking-tight text-text">
              {greeting}
              {displayName ? `, ${displayName}` : ""} 👋
            </h1>
            <p className="mt-1.5 max-w-md text-sm text-[#c9cfe3]">
              {summary
                ? tr.dashboard.todayLine(summary.overdueFollowUps + summary.pendingFollowUps, summary.replied)
                : tr.common.loading}
            </p>
          </div>
        </div>
        <div className="relative -mt-8 grid grid-cols-2 gap-3 px-4 pb-4 md:grid-cols-3 xl:grid-cols-6">
          {kpis.map((kpi) => (
            <button key={kpi.label} type="button" onClick={() => navigate(kpi.path)} className="text-left">
              <StatCard
                label={kpi.label}
                value={kpi.value?.toLocaleString("tr-TR") ?? "—"}
                icon={kpi.icon}
                color={kpi.color}
                delta={kpi.delta}
                compact
                className="h-full bg-surface-2/95 backdrop-blur transition-colors hover:border-border-strong"
              />
            </button>
          ))}
        </div>
      </section>

      <Card className="xl:row-span-1">
        <CardHeader
          title={tr.dashboard.aiAssistant}
          icon={<Sparkles className="size-4 text-violet" />}
          action={<CardLink onClick={() => useUiStore.getState().setJarvisOpen(true)}>{tr.common.seeAll}</CardLink>}
        />
        <CardBody className="space-y-3">
          <div className="flex items-center gap-3 rounded-lg bg-gradient-to-r from-primary/15 to-violet/15 p-3">
            <span className="flex size-10 items-center justify-center rounded-full bg-gradient-to-br from-primary to-violet text-white">
              <Sparkles className="size-5" />
            </span>
            <div>
              <p className="text-sm font-semibold text-text">{tr.shell.jarvisTitle}</p>
              <p className="text-xs text-muted">{tr.dashboard.jarvisHint}</p>
            </div>
          </div>
          <div className="space-y-2">
            {JARVIS_QUICK_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => askJarvis(prompt)}
                className="flex w-full items-center gap-2.5 rounded-lg border border-border bg-surface-2 px-3 py-2 text-left text-sm text-text transition-colors hover:border-primary/60"
              >
                <Sparkles className="size-3.5 shrink-0 text-primary" />
                {prompt}
              </button>
            ))}
          </div>
        </CardBody>
      </Card>

      <TodayTasksCard />

      <Card>
        <CardHeader
          title={tr.dashboard.performance}
          action={
            <Select value={days} onChange={(e) => setDays(Number(e.target.value))} className="h-8 w-auto text-xs">
              <option value={7}>{tr.common.last7Days}</option>
              <option value={30}>{tr.common.last30Days}</option>
              <option value={90}>{tr.common.last90Days}</option>
            </Select>
          }
        />
        <CardBody>
          <MultiLineChart data={chartData} series={series} xKey="label" height={220} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title={tr.dashboard.leadStatuses}
          action={<CardLink onClick={() => navigate("/leads")}>{tr.common.seeAll}</CardLink>}
        />
        <CardBody>
          <DonutChart segments={stageSegments(metrics?.stageCounts ?? {})} centerLabel={tr.dashboard.total} size={170} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title={tr.dashboard.recentActivity}
          action={<CardLink onClick={() => navigate("/reports?tab=activity")}>{tr.common.seeAll}</CardLink>}
        />
        <CardBody>
          <RecentActivity limit={6} />
        </CardBody>
      </Card>
    </div>
  );
}
