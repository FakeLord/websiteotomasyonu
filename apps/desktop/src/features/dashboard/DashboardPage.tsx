import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Building2, ChevronRight, Heart, MessageSquareReply, Send, UserCheck, UserPlus, Bot } from "lucide-react";
import { useMarket } from "../../lib/use-market";
import { supabase } from "../../lib/supabase-client";
import { useWorkspaceMembership } from "../../lib/use-workspace-membership";
import { useMyProfile } from "../../lib/use-shell-data";
import { useUiStore } from "../../lib/ui-store";
import { formatDayLabel, percentDelta, stageFunnel, stageSegments, useDashboardMetrics } from "../../lib/use-metrics";
import { useDraftQueue, usePlacesUsage } from "../../lib/use-jobs";
import { greetingForHour } from "../../lib/format";
import { tr } from "../../i18n/tr";
import { Card, CardBody, CardHeader, CardLink } from "../../components/ui/card";
import { Select } from "../../components/ui/input";
import { PageHeader, Progress, StatCard } from "../../components/ui/data-display";
import { DonutChart, MultiLineChart, SERIES_COLORS } from "../../components/charts/charts";
import { RecentActivity } from "../activity-log/RecentActivity";
import { JARVIS_QUICK_PROMPTS } from "../jarvis/JarvisPanel";
import { funnelSteps } from "../reports/report-math";
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

function OperationsCard() {
  const navigate = useNavigate();
  const queue = useDraftQueue().data;
  const usage = usePlacesUsage().data;
  const placesPercent = usage && usage.cap ? (usage.used / usage.cap) * 100 : 0;
  const waiting = (queue?.queued ?? 0) + (queue?.running ?? 0);

  const row = (label: string, value: React.ReactNode) => (
    <div className="flex items-center justify-between gap-3 border-b border-border py-2.5 text-sm last:border-b-0">
      <dt className="text-muted">{label}</dt>
      <dd className="font-semibold text-text tabular-nums">{value}</dd>
    </div>
  );

  return (
    <Card>
      <CardHeader
        title={tr.dashboard.operations.title}
        description={tr.dashboard.operations.description}
        action={<CardLink onClick={() => navigate("/review")}>{tr.dashboard.operations.openReview}</CardLink>}
      />
      <CardBody>
        <dl>
          {row(tr.dashboard.operations.pending, queue?.pendingApproval ?? "—")}
          {row(tr.dashboard.operations.queued, queue ? waiting : "—")}
          {row(
            tr.dashboard.operations.placesUsage,
            usage
              ? usage.cap
                ? `${usage.used.toLocaleString("tr-TR")} / ${usage.cap.toLocaleString("tr-TR")}`
                : usage.used.toLocaleString("tr-TR")
              : "—",
          )}
        </dl>
        {usage?.cap ? (
          <Progress
            value={placesPercent}
            color={placesPercent >= 90 ? "var(--color-danger)" : "var(--color-primary)"}
            className="mt-2"
          />
        ) : usage ? (
          <p className="mt-2 text-xs text-muted">{tr.dashboard.operations.noCap}</p>
        ) : null}
      </CardBody>
    </Card>
  );
}

function FunnelCard({ stageCounts }: { stageCounts: Record<string, number> | undefined }) {
  const steps = funnelSteps(stageFunnel(stageCounts ?? {}));
  const empty = steps.every((step) => step.value === 0);
  return (
    <Card>
      <CardHeader title={tr.dashboard.funnel.title} description={tr.dashboard.funnel.description} />
      <CardBody className="space-y-3">
        {empty ? (
          <p className="py-8 text-center text-sm text-muted">{tr.dashboard.funnel.empty}</p>
        ) : (
          steps.map((step) => (
            <div key={step.key} className="space-y-1">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-text">{tr.reports.funnelSteps[step.key]}</span>
                <span className="text-muted tabular-nums">
                  <span className="font-semibold text-text">{step.value.toLocaleString("tr-TR")}</span>
                  {step.fromPrevious !== null && step.value > 0 && <span className="ml-2 text-xs">{tr.reports.conversion(step.fromPrevious)}</span>}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-surface-3">
                <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(step.ofTop, step.value > 0 ? 2 : 0)}%` }} />
              </div>
            </div>
          ))
        )}
      </CardBody>
    </Card>
  );
}

export function DashboardPage() {
  const navigate = useNavigate();
  const { displayName } = useMyProfile();
  const askJarvis = useUiStore((state) => state.askJarvis);
  const [days, setDays] = useState(7);
  const summary = useAnalyticsSummary().data;
  const metrics = useDashboardMetrics(days).data;
  const pendingDrafts = useDraftQueue().data?.pendingApproval ?? 0;

  const greeting = tr.dashboard.greeting[greetingForHour(new Date().getHours())];
  const current = metrics?.current;
  const previous = metrics?.previous;
  const delta = (key: keyof NonNullable<typeof current>) =>
    current && previous ? percentDelta(current[key], previous[key]) : null;
  const trend = (key: keyof NonNullable<typeof current>) => metrics?.series.map((row) => row[key]);
  const replyRate = current && current.sent > 0 ? Math.round((current.replied / current.sent) * 100) : 0;

  const kpis = [
    {
      label: tr.dashboard.kpi.found,
      value: metrics?.totalBusinesses,
      icon: Building2,
      delta: delta("found"),
      trend: trend("found"),
      hint: tr.dashboard.kpiHint.cumulative,
      path: "/leads",
    },
    {
      label: tr.dashboard.kpi.newLeads,
      value: current?.found,
      icon: UserPlus,
      delta: delta("found"),
      trend: trend("found"),
      hint: tr.dashboard.kpiHint.newLeads(days),
      path: "/leads?stage=NEW",
    },
    {
      label: tr.dashboard.kpiSent,
      value: current?.sent,
      icon: Send,
      delta: delta("sent"),
      trend: trend("sent"),
      hint: tr.dashboard.kpiHint.sent,
      path: "/conversations",
    },
    {
      label: tr.dashboard.kpi.replied,
      value: current?.replied,
      icon: MessageSquareReply,
      delta: delta("replied"),
      trend: trend("replied"),
      hint: tr.dashboard.kpiHint.replyRate(replyRate),
      path: "/conversations",
    },
    {
      label: tr.dashboard.kpi.engaged,
      value: summary?.engaged,
      icon: Heart,
      delta: delta("engaged"),
      trend: trend("engaged"),
      hint: tr.dashboard.kpiHint.cumulative,
      path: "/leads?stage=ENGAGED",
    },
    {
      label: tr.dashboard.kpi.customers,
      value: summary?.customers,
      icon: UserCheck,
      delta: delta("won"),
      trend: trend("won"),
      hint: tr.dashboard.kpiHint.cumulative,
      path: "/customers",
    },
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
    <div className="space-y-5">
      <PageHeader
        title={`${greeting}${displayName ? `, ${displayName}` : ""}`}
        description={
          summary
            ? tr.dashboard.summaryLine(summary.overdueFollowUps + summary.pendingFollowUps, summary.replied, pendingDrafts)
            : tr.common.loading
        }
        actions={
          <Select value={days} onChange={(e) => setDays(Number(e.target.value))} className="h-9 w-auto text-sm" aria-label={tr.dashboard.performance}>
            <option value={7}>{tr.common.last7Days}</option>
            <option value={30}>{tr.common.last30Days}</option>
            <option value={90}>{tr.common.last90Days}</option>
          </Select>
        }
      />

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6" aria-label={tr.dashboard.title}>
        {kpis.map((kpi) => (
          <button
            key={kpi.label}
            type="button"
            onClick={() => navigate(kpi.path)}
            className="rounded-lg text-left transition-shadow hover:shadow-pop focus-visible:outline-2"
          >
            <StatCard
              label={kpi.label}
              value={kpi.value?.toLocaleString("tr-TR") ?? "—"}
              icon={kpi.icon}
              delta={kpi.delta}
              deltaLabel={tr.dashboard.vsPrevious}
              hint={kpi.hint}
              {...(kpi.trend ? { trend: kpi.trend } : {})}
              className="h-full"
            />
          </button>
        ))}
      </section>

      <div className="grid gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title={tr.dashboard.performance}
            description={tr.dashboard.performanceDescription}
            action={<CardLink onClick={() => navigate("/reports")}>{tr.dashboard.openReports}</CardLink>}
          />
          <CardBody>
            <MultiLineChart data={chartData} series={series} xKey="label" height={240} />
          </CardBody>
        </Card>

        <FunnelCard stageCounts={metrics?.stageCounts} />
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <Card>
          <CardHeader
            title={tr.dashboard.leadStatuses}
            description={tr.dashboard.leadStatusesDescription}
            action={<CardLink onClick={() => navigate("/leads")}>{tr.common.seeAll}</CardLink>}
          />
          <CardBody>
            <DonutChart segments={stageSegments(metrics?.stageCounts ?? {})} centerLabel={tr.dashboard.total} size={160} />
          </CardBody>
        </Card>

        <OperationsCard />

        <Card>
          <CardHeader
            title={tr.dashboard.assistant.title}
            description={tr.dashboard.assistant.description}
            icon={<Bot className="size-4 text-muted" />}
          />
          <CardBody className="space-y-2">
            {JARVIS_QUICK_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => askJarvis(prompt)}
                className="flex w-full items-center justify-between gap-2 rounded-md border border-border bg-surface-2 px-3 py-2 text-left text-sm text-text transition-colors hover:border-primary/50 hover:bg-surface"
              >
                <span className="min-w-0 truncate">{prompt}</span>
                <ChevronRight className="size-4 shrink-0 text-subtle" />
              </button>
            ))}
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <TodayTasksCard />
        </div>
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
    </div>
  );
}

