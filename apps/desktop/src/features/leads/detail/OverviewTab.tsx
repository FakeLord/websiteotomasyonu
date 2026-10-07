import { ExternalLink, Info, Sparkles, Star } from "lucide-react";
import { countryFlag, formatPhoneInternational, getCountryProfile, type Channel } from "@lbf/core";
import { tr } from "../../../i18n/tr";
import { Card, CardBody, CardHeader } from "../../../components/ui/card";
import { Badge, type BadgeTone } from "../../../components/ui/badge";
import { KeyValue } from "../../../components/ui/data-display";
import { ChannelIcon } from "../../../components/domain/channel-icon";
import { buildLeadSummary } from "./lead-summary";
import { channelDisplayValue, channelHref, type ContactChannelRow, type WorkspaceSettingsRow } from "./lead-data";
import type { BusinessDetail } from "../types";

const MODE_TONES: Record<string, BadgeTone> = { AUTOMATIC: "green", DRAFT: "blue", ASSISTED: "violet", MANUAL: "gray" };

export function ScoreReasons({ business }: { business: BusinessDetail }) {
  const reasons = (business.score_breakdown as { reasons?: Array<{ rule: string; points: number }> }).reasons ?? [];
  if (reasons.length === 0) return <p className="text-sm text-muted">{tr.leadDetail.noScoreReasons}</p>;
  return (
    <ul className="space-y-1.5">
      {[...reasons]
        .sort((a, b) => b.points - a.points)
        .map((r) => (
          <li key={r.rule} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex items-center gap-2 text-text">
              <span className={`size-1.5 rounded-full ${r.points >= 0 ? "bg-success" : "bg-danger"}`} />
              {tr.scoreRules[r.rule as keyof typeof tr.scoreRules] ?? r.rule}
            </span>
            <span className={`font-medium tabular-nums ${r.points >= 0 ? "text-[#4ade80]" : "text-[#f87171]"}`}>
              {r.points > 0 ? `+${r.points}` : r.points}
            </span>
          </li>
        ))}
    </ul>
  );
}

export function OverviewTab({
  business,
  channels,
  settings,
}: {
  business: BusinessDetail;
  channels: ContactChannelRow[];
  settings: WorkspaceSettingsRow | undefined;
}) {
  const email = channels.find((c) => c.channel === "EMAIL")?.value;
  const summary = buildLeadSummary({
    websiteStatus: business.website_status,
    rating: business.rating,
    reviewCount: business.review_count,
    channelCount: channels.length,
    score: business.lead_score,
  });

  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <Card>
        <CardHeader title={tr.leadDetail.basicInfo} icon={<Info className="size-4 text-primary" />} />
        <CardBody className="divide-y divide-border/60">
          <KeyValue label={tr.discover.countryLabel}>
            {countryFlag(business.country_code)} {getCountryProfile(business.country_code).nameTr}
            {business.region ? ` · ${business.region}` : ""}
          </KeyValue>
          <KeyValue label={tr.leads.phoneLabel}>{business.primary_phone_e164 ? formatPhoneInternational(business.primary_phone_e164) : "—"}</KeyValue>
          <KeyValue label={tr.leads.emailLabel}>{email ?? "—"}</KeyValue>
          <KeyValue label={tr.leads.websiteLabel}>
            {business.website_url ? (
              <a href={business.website_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                {business.website_domain ?? business.website_url}
                <ExternalLink className="size-3" />
              </a>
            ) : (
              "—"
            )}
          </KeyValue>
          <KeyValue label={tr.leadDetail.address}>{business.address ?? "—"}</KeyValue>
          <KeyValue label={tr.leadDetail.googleRating}>
            {business.rating !== null ? (
              <span className="inline-flex items-center gap-1">
                <Star className="size-3.5 fill-warning text-warning" />
                {business.rating.toLocaleString("tr-TR")}
                <span className="text-muted">({business.review_count ?? 0})</span>
              </span>
            ) : (
              "—"
            )}
          </KeyValue>
          <KeyValue label={tr.leadDetail.businessStatus}>
            {business.business_status ? tr.businessStatus[business.business_status as keyof typeof tr.businessStatus] : "—"}
          </KeyValue>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={tr.leadDetail.analysisSummary} icon={<Sparkles className="size-4 text-violet" />} />
        <CardBody className="space-y-4">
          <p className="rounded-lg bg-surface-2 p-3 text-sm leading-relaxed text-text">{summary}</p>
          <div>
            <p className="mb-2 text-xs font-medium text-muted">{tr.leadDetail.keyReasons}</p>
            <ScoreReasons business={business} />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={tr.leadDetail.contactChannels} />
        <CardBody>
          {channels.length === 0 && <p className="text-sm text-muted">{tr.leadDetail.noChannels}</p>}
          <ul className="space-y-2">
            {channels.map((c) => {
              const mode = settings?.channel_modes[c.channel as Channel];
              const href = channelHref(c);
              return (
                <li key={c.id} className="flex items-center gap-3 rounded-lg bg-surface-2 p-2.5">
                  <ChannelIcon channel={c.channel} boxed />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-text">{tr.channels[c.channel as keyof typeof tr.channels] ?? c.channel}</p>
                    {href ? (
                      <a href={href} target="_blank" rel="noreferrer" className="block truncate text-xs text-muted hover:text-primary">
                        {channelDisplayValue(c)}
                      </a>
                    ) : (
                      <p className="truncate text-xs text-muted">{channelDisplayValue(c)}</p>
                    )}
                  </div>
                  {c.status === "INVALID" || c.status === "BOUNCED" ? (
                    <Badge tone="red">{tr.channelStatus[c.status]}</Badge>
                  ) : mode ? (
                    <Badge tone={MODE_TONES[mode] ?? "gray"}>{tr.channelModes[mode]}</Badge>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}
