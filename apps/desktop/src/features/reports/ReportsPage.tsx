import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Banknote, Building2, Send, Sparkles, UserCheck, MessageSquareReply } from "lucide-react";
import { useMarket } from "../../lib/use-market";
import { supabase } from "../../lib/supabase-client";
import { useWorkspaceMembership } from "../../lib/use-workspace-membership";
import { formatDayLabel, percentDelta, type PeriodCounts } from "../../lib/use-metrics";
import { formatCurrency } from "../../lib/format";
import { tr } from "../../i18n/tr";
import { Input, Select } from "../../components/ui/input";
import { Card, CardBody, CardHeader } from "../../components/ui/card";
import { Avatar, PageHeader, Progress, StatCard, Table, Td, Th, Tr } from "../../components/ui/data-display";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/primitives";
import { DonutChart, MultiLineChart, OTHER_COLOR, SEGMENT_COLORS, SERIES_COLORS } from "../../components/charts/charts";
import { ChannelIcon } from "../../components/domain/channel-icon";
import { ActivityLogTable } from "../activity-log/ActivityLogPage";
import { EMPTY_STATS, replyRate, useCampaigns } from "../campaigns/campaign-data";
import { CAMPAIGN_STATUS_TONES } from "../campaigns/CampaignsPage";
import { Badge } from "../../components/ui/badge";
import { funnelSteps, rangeForPreset, type FunnelCounts } from "./report-math";

interface ReportMetrics {
  from: string;
  to: string;
  totals: PeriodCounts;
  previous: PeriodCounts;
  series: Array<PeriodCounts & { day: string }>;
  bySource: Record<string, number>;
  byChannel: Record<string, { sent: number; replied: number }>;
  funnel: FunnelCounts;
  team: Array<{ userId: string; name: string; role: string; assigned: number; sent: number; won: number; activities: number }>;
  aiUsage: Array<{ provider: string; status: string; count: number }>;
  revenue: Record<string, number>;
}

type Preset = "7" | "30" | "90" | "month" | "custom";
const TABS = ["overview", "source", "channel", "conversion", "team", "campaigns", "activity"] as const;

export function ReportsPage() {
  const workspaceId = useWorkspaceMembership().data?.workspaceId;
  const [params, setParams] = useSearchParams();
  const tab = TABS.includes(params.get("tab") as (typeof TABS)[number]) ? (params.get("tab") as (typeof TABS)[number]) : "overview";
  const [preset, setPreset] = useState<Preset>("30");
  const [custom, setCustom] = useState(() => rangeForPreset("30", new Date()));
  const range = preset === "custom" ? custom : rangeForPreset(preset, new Date());
  const { campaigns, stats } = useCampaigns();
  const { market, rpcParams } = useMarket();

  const query = useQuery({
    queryKey: ["report-metrics", workspaceId, range.from, range.to, market.country, market.city],
    enabled: !!workspaceId && !!range.from && !!range.to,
    queryFn: async (): Promise<ReportMetrics> => {
      const { data, error } = await supabase.rpc("report_metrics", {
        ws: workspaceId as string,
        p_from: range.from,
        p_to: range.to,
        ...rpcParams,
      });
      if (error) throw error;
      return data as ReportMetrics;
    },
  });

  const m = query.data;
  const totals = m?.totals;
  const delta = (key: keyof PeriodCounts) => (m ? percentDelta(m.totals[key], m.previous[key]) : null);
  const replyPct = totals && totals.sent > 0 ? Math.round((totals.replied / totals.sent) * 100) : 0;
  const tryRevenue = m?.revenue.TRY ?? 0;

  const series = [
    { key: "found", label: tr.dashboard.series.found, color: SERIES_COLORS[0] },
    { key: "sent", label: tr.dashboard.series.sent, color: SERIES_COLORS[1] },
    { key: "replied", label: tr.dashboard.series.replied, color: SERIES_COLORS[2] },
    { key: "engaged", label: tr.dashboard.series.engaged, color: SERIES_COLORS[3] },
    { key: "won", label: tr.dashboard.series.won, color: SERIES_COLORS[4] },
  ];
  const chartData = (m?.series ?? []).map((row) => ({ ...row, label: formatDayLabel(row.day) }));

  const channelEntries = Object.entries(m?.byChannel ?? {}).sort((a, b) => b[1].sent - a[1].sent);
  const channelSegments = channelEntries.map(([channel, v], i) => ({
    key: channel,
    label: tr.channels[channel as keyof typeof tr.channels] ?? channel,
    value: v.sent,
    color: SEGMENT_COLORS[i] ?? OTHER_COLOR,
  }));
  const sourceEntries = Object.entries(m?.bySource ?? {}).sort((a, b) => b[1] - a[1]);
  const sourceMax = Math.max(1, ...sourceEntries.map(([, v]) => v));

  return (
    <div className="space-y-5">
      <PageHeader
        title={tr.reports.title}
        description={m ? tr.reports.rangeLine(m.from, m.to) : undefined}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Select className="w-40" value={preset} onChange={(e) => setPreset(e.target.value as Preset)}>
              <option value="7">{tr.common.last7Days}</option>
              <option value="30">{tr.common.last30Days}</option>
              <option value="90">{tr.common.last90Days}</option>
              <option value="month">{tr.reports.thisMonth}</option>
              <option value="custom">{tr.reports.custom}</option>
            </Select>
            {preset === "custom" && (
              <>
                <Input type="date" className="w-40" value={custom.from} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} />
                <Input type="date" className="w-40" value={custom.to} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} />
              </>
            )}
          </div>
        }
      />
      {query.isError && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-[#f87171]">{query.error instanceof Error ? query.error.message : tr.common.error}</p>}

      <Tabs value={tab} onValueChange={(v) => setParams({ tab: v }, { replace: true })} className="space-y-5">
        <TabsList>
          {TABS.map((t) => (
            <TabsTrigger key={t} value={t}>
              {tr.reports.tabs[t]}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview" className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <StatCard label={tr.reports.kpi.found} value={totals?.found ?? "—"} icon={Building2} color="#3b82f6" delta={delta("found")} />
            <StatCard label={tr.reports.kpi.sent} value={totals?.sent ?? "—"} icon={Send} color="#f59e0b" delta={delta("sent")} />
            <StatCard label={tr.reports.kpi.replyRate} value={`%${replyPct}`} icon={MessageSquareReply} color="#ec4899" />
            <StatCard label={tr.reports.kpi.won} value={totals?.won ?? "—"} icon={UserCheck} color="#22c55e" delta={delta("won")} />
            <StatCard label={tr.reports.kpi.revenue} value={formatCurrency(tryRevenue)} icon={Banknote} color="#8b5cf6" />
          </div>
          <div className="grid gap-5 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader title={tr.reports.dailyPerformance} />
              <CardBody>
                <MultiLineChart data={chartData} series={series} xKey="label" height={260} />
              </CardBody>
            </Card>
            <Card>
              <CardHeader title={tr.reports.channelDistribution} />
              <CardBody>
                {channelSegments.length === 0 ? (
                  <p className="py-10 text-center text-sm text-muted">{tr.reports.noMessages}</p>
                ) : (
                  <DonutChart segments={channelSegments} centerLabel={tr.reports.messages} size={160} />
                )}
              </CardBody>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="source">
          <Card>
            <CardHeader title={tr.reports.bySource} />
            <CardBody className="space-y-4">
              {sourceEntries.length === 0 && <p className="text-sm text-muted">{tr.reports.noData}</p>}
              {sourceEntries.map(([source, value]) => (
                <div key={source} className="space-y-1.5">
                  <div className="flex justify-between text-sm">
                    <span className="text-text">{tr.reports.sources[source as keyof typeof tr.reports.sources] ?? source}</span>
                    <span className="text-muted tabular-nums">{value}</span>
                  </div>
                  <Progress value={(value / sourceMax) * 100} />
                </div>
              ))}
            </CardBody>
          </Card>
        </TabsContent>

        <TabsContent value="channel">
          <Card>
            <CardHeader title={tr.reports.byChannel} />
            {channelEntries.length === 0 ? (
              <p className="px-4 pb-6 text-sm text-muted">{tr.reports.noMessages}</p>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>{tr.draft.channelLabel}</Th>
                    <Th>{tr.reports.kpi.sent}</Th>
                    <Th>{tr.reports.replies}</Th>
                    <Th>{tr.reports.kpi.replyRate}</Th>
                  </tr>
                </thead>
                <tbody>
                  {channelEntries.map(([channel, v]) => (
                    <Tr key={channel}>
                      <Td>
                        <span className="flex items-center gap-2">
                          <ChannelIcon channel={channel} />
                          {tr.channels[channel as keyof typeof tr.channels] ?? channel}
                        </span>
                      </Td>
                      <Td className="tabular-nums">{v.sent}</Td>
                      <Td className="tabular-nums">{v.replied}</Td>
                      <Td className="tabular-nums">%{v.sent > 0 ? Math.round((v.replied / v.sent) * 100) : 0}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="conversion">
          <Card>
            <CardHeader title={tr.reports.funnel} />
            <CardBody className="space-y-3">
              {m &&
                funnelSteps(m.funnel).map((step) => (
                  <div key={step.key} className="grid grid-cols-[160px_minmax(0,1fr)_120px] items-center gap-3">
                    <span className="text-sm text-text">{tr.reports.funnelSteps[step.key]}</span>
                    <div className="h-7 overflow-hidden rounded-md bg-surface-2">
                      <div
                        className="flex h-full items-center rounded-md bg-gradient-to-r from-primary to-violet px-2 text-xs font-medium text-white"
                        style={{ width: `${Math.max(step.ofTop, step.value > 0 ? 6 : 0)}%` }}
                      >
                        {step.value > 0 ? step.value : ""}
                      </div>
                    </div>
                    <span className="text-right text-xs text-muted">
                      {step.fromPrevious === null ? tr.reports.base : tr.reports.conversion(step.fromPrevious)}
                    </span>
                  </div>
                ))}
            </CardBody>
          </Card>
        </TabsContent>

        <TabsContent value="team">
          <Card>
            <CardHeader title={tr.reports.teamPerformance} />
            <Table>
              <thead>
                <tr>
                  <Th>{tr.team.member}</Th>
                  <Th>{tr.reports.assigned}</Th>
                  <Th>{tr.reports.kpi.sent}</Th>
                  <Th>{tr.reports.kpi.won}</Th>
                  <Th>{tr.reports.activities}</Th>
                </tr>
              </thead>
              <tbody>
                {m?.team.map((member) => (
                  <Tr key={member.userId}>
                    <Td>
                      <span className="flex items-center gap-2">
                        <Avatar name={member.name} size="sm" />
                        {member.name}
                      </span>
                    </Td>
                    <Td className="tabular-nums">{member.assigned}</Td>
                    <Td className="tabular-nums">{member.sent}</Td>
                    <Td className="tabular-nums">{member.won}</Td>
                    <Td className="tabular-nums">{member.activities}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
            <div className="border-t border-border p-4">
              <p className="mb-2 flex items-center gap-2 text-sm font-medium text-text">
                <Sparkles className="size-4 text-violet" />
                {tr.reports.aiUsage}
              </p>
              {(m?.aiUsage.length ?? 0) === 0 ? (
                <p className="text-sm text-muted">{tr.reports.noData}</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {m?.aiUsage.map((u) => (
                    <Badge key={`${u.provider}-${u.status}`} tone={u.status === "OK" ? "green" : u.status === "CACHED" ? "blue" : "red"}>
                      {u.provider} · {tr.reports.aiStatus[u.status as keyof typeof tr.reports.aiStatus] ?? u.status}: {u.count}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="campaigns">
          <Card>
            <CardHeader title={tr.campaigns.title} />
            <Table>
              <thead>
                <tr>
                  <Th>{tr.campaigns.name}</Th>
                  <Th>{tr.leads.columns.status}</Th>
                  <Th>{tr.campaigns.members}</Th>
                  <Th>{tr.campaigns.sent}</Th>
                  <Th>{tr.campaigns.replied}</Th>
                  <Th>{tr.campaigns.replyRate}</Th>
                </tr>
              </thead>
              <tbody>
                {(campaigns.data ?? []).map((c) => {
                  const s = stats.data?.[c.id] ?? EMPTY_STATS;
                  return (
                    <Tr key={c.id}>
                      <Td>
                        <span className="flex items-center gap-2">
                          <ChannelIcon channel={c.channel} />
                          {c.name}
                        </span>
                      </Td>
                      <Td>
                        <Badge tone={CAMPAIGN_STATUS_TONES[c.status]}>{tr.campaigns.statuses[c.status]}</Badge>
                      </Td>
                      <Td className="tabular-nums">{s.total}</Td>
                      <Td className="tabular-nums">{s.sent}</Td>
                      <Td className="tabular-nums">{s.replied}</Td>
                      <Td className="tabular-nums">%{replyRate(s)}</Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
            {(campaigns.data ?? []).length === 0 && <p className="p-6 text-center text-sm text-muted">{tr.campaigns.empty}</p>}
          </Card>
        </TabsContent>

        <TabsContent value="activity">
          <ActivityLogTable />
        </TabsContent>
      </Tabs>
    </div>
  );
}
