import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Megaphone, Plus } from "lucide-react";
import { formatDate, formatRelative } from "../../lib/format";
import { tr } from "../../i18n/tr";
import { cn } from "../../lib/cn";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { EmptyState, PageHeader, Progress } from "../../components/ui/data-display";
import { ChannelIcon, channelColor } from "../../components/domain/channel-icon";
import { CreateCampaignDialog } from "./CreateCampaignDialog";
import { EMPTY_STATS, describeSegment, replyRate, useCampaigns, type CampaignStatus } from "./campaign-data";

export const CAMPAIGN_STATUS_TONES: Record<CampaignStatus, "gray" | "green" | "orange" | "blue"> = {
  DRAFT: "gray",
  ACTIVE: "green",
  PAUSED: "orange",
  COMPLETED: "blue",
};

export function CampaignsPage() {
  const navigate = useNavigate();
  const { campaigns, stats } = useCampaigns();
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState<CampaignStatus | "ALL">("ALL");
  const list = (campaigns.data ?? []).filter((c) => filter === "ALL" || c.status === filter);

  return (
    <div>
      <PageHeader
        title={tr.campaigns.title}
        description={tr.campaigns.description}
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus />
            {tr.campaigns.newCampaign}
          </Button>
        }
      />

      <div className="mb-4 flex gap-1">
        {(["ALL", "ACTIVE", "DRAFT", "PAUSED", "COMPLETED"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium",
              filter === f ? "bg-primary text-white" : "text-muted hover:bg-surface-2 hover:text-text",
            )}
          >
            {f === "ALL" ? tr.common.all : tr.campaigns.statuses[f]}
          </button>
        ))}
      </div>

      {list.length === 0 && !campaigns.isPending ? (
        <Card>
          <EmptyState
            icon={Megaphone}
            title={tr.campaigns.empty}
            description={tr.campaigns.emptyHint}
            action={
              <Button onClick={() => setCreating(true)}>
                <Plus />
                {tr.campaigns.newCampaign}
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {list.map((campaign) => {
            const s = stats.data?.[campaign.id] ?? EMPTY_STATS;
            const progress = s.total > 0 ? ((s.sent + s.skipped) / s.total) * 100 : 0;
            return (
              <button
                key={campaign.id}
                type="button"
                onClick={() => navigate(`/campaigns/${campaign.id}`)}
                className="rounded-xl border border-border bg-surface p-4 text-left transition-colors hover:border-border-strong"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <ChannelIcon channel={campaign.channel} boxed />
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-text">{campaign.name}</p>
                      <p className="truncate text-xs text-muted">
                        {describeSegment(campaign.segment, {
                          minScore: tr.campaigns.minScoreShort,
                          websiteStatus: tr.websiteAnalysis.statusShort,
                        }) || tr.campaigns.allLeads}
                      </p>
                    </div>
                  </div>
                  <Badge tone={CAMPAIGN_STATUS_TONES[campaign.status]}>{tr.campaigns.statuses[campaign.status]}</Badge>
                </div>

                <div className="mt-4 space-y-1.5">
                  <div className="flex justify-between text-xs text-muted">
                    <span>{tr.campaigns.progress}</span>
                    <span className="text-text tabular-nums">
                      {s.sent} / {s.total}
                    </span>
                  </div>
                  <Progress value={progress} color={channelColor(campaign.channel)} />
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-surface-2 py-2">
                    <p className="text-lg font-semibold text-text tabular-nums">{s.queued + s.drafted}</p>
                    <p className="text-[11px] text-muted">{tr.campaigns.waiting}</p>
                  </div>
                  <div className="rounded-lg bg-surface-2 py-2">
                    <p className="text-lg font-semibold text-text tabular-nums">{s.replied}</p>
                    <p className="text-[11px] text-muted">{tr.campaigns.replied}</p>
                  </div>
                  <div className="rounded-lg bg-surface-2 py-2">
                    <p className="text-lg font-semibold text-text tabular-nums">%{replyRate(s)}</p>
                    <p className="text-[11px] text-muted">{tr.campaigns.replyRate}</p>
                  </div>
                </div>

                <p className="mt-3 text-xs text-subtle">
                  {s.lastSentAt ? tr.campaigns.lastSent(formatRelative(s.lastSentAt)) : tr.campaigns.createdAt(formatDate(campaign.created_at))}
                </p>
              </button>
            );
          })}
        </div>
      )}

      {creating && <CreateCampaignDialog open={creating} onOpenChange={setCreating} />}
    </div>
  );
}
