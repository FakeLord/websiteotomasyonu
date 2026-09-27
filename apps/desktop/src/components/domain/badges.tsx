import { tr } from "../../i18n/tr";
import { Badge, type BadgeTone } from "../ui/badge";
import { cn } from "../../lib/cn";

export const STAGE_TONES: Record<string, BadgeTone> = {
  NEW: "red",
  QUALIFIED: "cyan",
  OUTREACH_READY: "blue",
  CONTACTED: "blue",
  REPLIED: "cyan",
  ENGAGED: "green",
  PROPOSAL_READY: "orange",
  HANDED_OFF: "violet",
  WON: "green",
  DISQUALIFIED: "gray",
  LOST: "gray",
};

export const STAGE_COLORS: Record<string, string> = {
  NEW: "#2f6bff",
  QUALIFIED: "#06b6d4",
  OUTREACH_READY: "#6366f1",
  CONTACTED: "#8b5cf6",
  REPLIED: "#f59e0b",
  ENGAGED: "#ec4899",
  PROPOSAL_READY: "#f97316",
  HANDED_OFF: "#a855f7",
  WON: "#22c55e",
  DISQUALIFIED: "#5d688a",
  LOST: "#ef4444",
};

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
  const color = score >= 80 ? "#22c55e" : score >= 60 ? "#84cc16" : score >= 40 ? "#f59e0b" : "#ef4444";
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-lg font-semibold tabular-nums",
        size === "lg" ? "size-16 text-2xl" : "h-7 min-w-9 px-1.5 text-sm",
      )}
      style={{ backgroundColor: `${color}22`, color, boxShadow: `inset 0 0 0 1px ${color}55` }}
    >
      {score}
    </span>
  );
}
