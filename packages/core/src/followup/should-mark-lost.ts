import type { BusinessStage } from "../pipeline/stage";

export const NO_RESPONSE_GRACE_DAYS = 7;

export interface SequenceState {
  stage: BusinessStage;
  /** `followup_policy.afterSequence`; yalnızca `MARK_LOST_NO_RESPONSE` otomatik kapatır. */
  afterSequence: string;
  /** Politikadaki adım sayısı. */
  policySteps: number;
  followUps: Array<{ step: number; status: "PENDING" | "DRAFTED" | "SENT" | "CANCELLED" | "SKIPPED" }>;
  lastOutboundAt: Date | null;
  /** İlk temastan sonra otomatik yanıt dışında gelen mesaj var mı. */
  hasReplySinceFirstContact: boolean;
}

/**
 * SPEC.md → M/K: "Sekans bittiğinde ve 7 gün daha cevap yoksa lead LOST
 * (NO_RESPONSE) olur." Asıl uygulama `close_stale_sequences` RPC'sindedir
 * (SQL, tek yerde); bu fonksiyon kuralın ayna testidir.
 */
export function shouldMarkLostNoResponse(state: SequenceState, now: Date = new Date()): boolean {
  if (state.stage !== "CONTACTED" || state.afterSequence !== "MARK_LOST_NO_RESPONSE") return false;
  if (state.hasReplySinceFirstContact || !state.lastOutboundAt) return false;
  if (state.followUps.some((f) => f.status === "PENDING" || f.status === "DRAFTED")) return false;

  const finishedSteps = new Set(state.followUps.filter((f) => f.status === "SENT" || f.status === "SKIPPED").map((f) => f.step));
  for (let step = 1; step <= state.policySteps; step += 1) {
    if (!finishedSteps.has(step)) return false;
  }

  return now.getTime() - state.lastOutboundAt.getTime() >= NO_RESPONSE_GRACE_DAYS * 86_400_000;
}
