import { tr } from "../../i18n/tr";
import { Badge, type BadgeTone } from "../ui/badge";
import { cn } from "../../lib/cn";
import { STAGE_COLORS, scoreColor } from "../../lib/theme-colors";

export const STAGE_TONES: Record<string, BadgeTone> = {
  NEW: "gray",
  QUALIFIED: "blue",
  OUTREACH_READY: "blue",
  CONTACTED: "navy",
  REPLIED: "orange",
  ENGAGED: "green",
  PROPOSAL_READY: "navy",
  HANDED_OFF: "navy",
  WON: "green",
  DISQUALIFIED: "gray",
  LOST: "red",
};

export { STAGE_COLORS };

export function StageBadge({ stage }: { stage: string }) {
  const label = tr.stages[stage as keyof typeof tr.stages] ?? stage;
  return <Badge tone={STAGE_TONES[stage] ?? "gray"}>{label}</Badge>;
}

const WEBSITE_TONES: Record<string, BadgeTone> = {
  NO_WEBSITE: "red",
  BROKEN_WEBSITE: "red",
  LOW_QUALITY_WEBSITE: "orange",
  GOOD_WEBSITE: "green",
};

export function WebsiteStatusBadge({ status }: { status: string | null }) {
  if (!status) return <Badge tone="gray">{tr.websiteAnalysis.notAnalyzedShort}</Badge>;
  const label = tr.websiteAnalysis.statusShort[status as keyof typeof tr.websiteAnalysis.statusShort] ?? status;
  return <Badge tone={WEBSITE_TONES[status] ?? "gray"}>{label}</Badge>;
}

/** Skoru görseldeki yeşil kare rozetle gösterir; eşiklere göre renk değişir. */
export function ScoreBadge({ score, size = "md" }: { score: number | null; size?: "md" | "lg" }) {
  if (score === null) {
    return <span className="text-sm text-subtle">—</span>;
  }
  const color = scoreColor(score);
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-lg font-semibold tabular-nums",
        size === "lg" ? "size-16 text-2xl" : "h-7 min-w-9 px-1.5 text-sm",
      )}
      style={{ backgroundColor: `${color}14`, color, boxShadow: `inset 0 0 0 1px ${color}40` }}
    >
      {score}
    </span>
  );
}
