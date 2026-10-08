import { endOfLocalDay } from "./contact-filters";

/** Takip tarihi gelmiş işletmede artık beklenecek bir şey olmayan aşamalar. */
export const FINISHED_STAGES = "(WON,LOST,DISQUALIFIED)";

interface DueFilterable<Q> {
  lte(column: string, value: string): Q;
  not(column: string, operator: string, value: string): Q;
  eq(column: string, value: boolean): Q;
}

/**
 * "Takip" görünümü (Leadler sekmesi ve Dashboard "Bugünün işleri"): takip tarihi bugün veya geçmiş, bitmemiş aşamada,
 * aranabilir işletmeler. Tek yerde durur ki iki ekran aynı sayıyı göstersin.
 */
export function applyDue<Q extends DueFilterable<Q>>(q: Q, now: Date = new Date()): Q {
  return q.lte("next_action_at", endOfLocalDay(now).toISOString()).not("stage", "in", FINISHED_STAGES).eq("do_not_contact", false);
}
