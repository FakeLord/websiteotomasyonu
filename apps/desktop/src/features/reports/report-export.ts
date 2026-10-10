import { toCsv } from "../../lib/filters";
import { tr } from "../../i18n/tr";
import { funnelSteps, type FunnelCounts } from "./report-math";

/** Raporlar sayfasının dışa aktarılabilir bölümleri; diğer sekmeler (segment, kampanya, etkinlik) kendi tablolarında. */
export type ExportableTab = "overview" | "source" | "channel" | "conversion" | "team";

export interface ExportableMetrics {
  series: Array<{ day: string; found: number; sent: number; replied: number; engaged: number; won: number }>;
  bySource: Record<string, number>;
  byChannel: Record<string, { sent: number; replied: number }>;
  funnel: FunnelCounts;
  team: Array<{ name: string; assigned: number; sent: number; won: number; activities: number }>;
}

export const EXPORTABLE_TABS: readonly ExportableTab[] = ["overview", "source", "channel", "conversion", "team"];

export function isExportableTab(tab: string): tab is ExportableTab {
  return (EXPORTABLE_TABS as readonly string[]).includes(tab);
}

const rate = (replied: number, sent: number) => (sent > 0 ? Math.round((replied / sent) * 100) : 0);

/** Sekmenin verisini CSV'ye çevirir; dosya adı sekme ve tarih aralığını taşır. */
export function buildReportCsv(
  tab: ExportableTab,
  metrics: ExportableMetrics,
  range: { from: string; to: string },
): { filename: string; csv: string } {
  const suffix = `${range.from}_${range.to}`;
  switch (tab) {
    case "overview":
      return {
        filename: `rapor-gunluk-${suffix}.csv`,
        csv: toCsv(metrics.series, [
          { key: "day", label: tr.reports.export.day },
          { key: "found", label: tr.dashboard.series.found },
          { key: "sent", label: tr.dashboard.series.sent },
          { key: "replied", label: tr.dashboard.series.replied },
          { key: "engaged", label: tr.dashboard.series.engaged },
          { key: "won", label: tr.dashboard.series.won },
        ]),
      };
    case "source":
      return {
        filename: `rapor-kaynak-${suffix}.csv`,
        csv: toCsv(
          Object.entries(metrics.bySource)
            .sort((a, b) => b[1] - a[1])
            .map(([source, count]) => ({
              source: tr.reports.sources[source as keyof typeof tr.reports.sources] ?? source,
              count,
            })),
          [
            { key: "source", label: tr.reports.export.source },
            { key: "count", label: tr.reports.export.count },
          ],
        ),
      };
    case "channel":
      return {
        filename: `rapor-kanal-${suffix}.csv`,
        csv: toCsv(
          Object.entries(metrics.byChannel)
            .sort((a, b) => b[1].sent - a[1].sent)
            .map(([channel, v]) => ({
              channel: tr.channels[channel as keyof typeof tr.channels] ?? channel,
              sent: v.sent,
              replied: v.replied,
              rate: `%${rate(v.replied, v.sent)}`,
            })),
          [
            { key: "channel", label: tr.draft.channelLabel },
            { key: "sent", label: tr.reports.kpi.sent },
            { key: "replied", label: tr.reports.replies },
            { key: "rate", label: tr.reports.kpi.replyRate },
          ],
        ),
      };
    case "conversion":
      return {
        filename: `rapor-donusum-${suffix}.csv`,
        csv: toCsv(
          funnelSteps(metrics.funnel).map((step) => ({
            step: tr.reports.funnelSteps[step.key],
            value: step.value,
            fromPrevious: step.fromPrevious === null ? "" : `%${step.fromPrevious}`,
          })),
          [
            { key: "step", label: tr.reports.export.step },
            { key: "value", label: tr.reports.export.count },
            { key: "fromPrevious", label: tr.reports.export.fromPrevious },
          ],
        ),
      };
    case "team":
      return {
        filename: `rapor-ekip-${suffix}.csv`,
        csv: toCsv(metrics.team, [
          { key: "name", label: tr.team.member },
          { key: "assigned", label: tr.reports.assigned },
          { key: "sent", label: tr.reports.kpi.sent },
          { key: "won", label: tr.reports.kpi.won },
          { key: "activities", label: tr.reports.activities },
        ]),
      };
  }
}
