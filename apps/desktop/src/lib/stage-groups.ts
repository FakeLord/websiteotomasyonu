import type { BusinessStage } from "@lbf/core";
import { tr } from "../i18n/tr";

export type StageGroupKey = "new" | "contacted" | "replied" | "engaged" | "proposal" | "won" | "closed";

export interface StageGroup {
  key: StageGroupKey;
  label: string;
  stages: BusinessStage[];
}

/** 11 aşamanın ekranlarda kullanılan 7 gruba indirgenmesi (sekmeler, donut). */
export const STAGE_GROUPS: StageGroup[] = [
  { key: "new", label: tr.stageGroups.new, stages: ["NEW", "QUALIFIED", "OUTREACH_READY"] },
  { key: "contacted", label: tr.stageGroups.contacted, stages: ["CONTACTED"] },
  { key: "replied", label: tr.stageGroups.replied, stages: ["REPLIED"] },
  { key: "engaged", label: tr.stageGroups.engaged, stages: ["ENGAGED"] },
  { key: "proposal", label: tr.stageGroups.proposal, stages: ["PROPOSAL_READY", "HANDED_OFF"] },
  { key: "won", label: tr.stageGroups.won, stages: ["WON"] },
  { key: "closed", label: tr.stageGroups.closed, stages: ["DISQUALIFIED", "LOST"] },
];

export function countForGroup(group: StageGroup, stageCounts: Record<string, number>): number {
  return group.stages.reduce((sum, stage) => sum + (stageCounts[stage] ?? 0), 0);
}
