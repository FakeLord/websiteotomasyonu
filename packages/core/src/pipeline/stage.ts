export const BUSINESS_STAGES = [
  "NEW",
  "QUALIFIED",
  "OUTREACH_READY",
  "CONTACTED",
  "REPLIED",
  "ENGAGED",
  "PROPOSAL_READY",
  "HANDED_OFF",
  "WON",
  "DISQUALIFIED",
  "LOST",
] as const;

export type BusinessStage = (typeof BUSINESS_STAGES)[number];

/**
 * 11 aşamalı pipeline geçiş tablosu (SPEC.md → K). Yalnızca UI'da anlık
 * "geçersiz geçiş" geri bildirimi için kullanılır; asıl yetkili doğrulama
 * `transition_stage()` SQL RPC'sindeki `is_valid_stage_transition()`
 * fonksiyonudur (supabase/migrations/20260925191300_pipeline_and_merge.sql).
 * Bu tablo değişirse SQL karşılığı da güncellenmelidir.
 */
const TRANSITIONS: Record<BusinessStage, readonly BusinessStage[]> = {
  NEW: ["QUALIFIED", "DISQUALIFIED"],
  QUALIFIED: ["OUTREACH_READY", "DISQUALIFIED"],
  OUTREACH_READY: ["CONTACTED"],
  CONTACTED: ["REPLIED", "LOST"],
  REPLIED: ["ENGAGED", "LOST"],
  ENGAGED: ["PROPOSAL_READY", "LOST"],
  PROPOSAL_READY: ["HANDED_OFF"],
  HANDED_OFF: ["WON", "LOST"],
  WON: [],
  DISQUALIFIED: [],
  LOST: ["QUALIFIED"],
};

export function isValidTransition(from: BusinessStage, to: BusinessStage): boolean {
  return TRANSITIONS[from].includes(to);
}

export function allowedNextStages(from: BusinessStage): readonly BusinessStage[] {
  return TRANSITIONS[from];
}
