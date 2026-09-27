export interface DealLike {
  amount: number | string | null;
  currency: "TRY" | "USD" | "EUR";
  billing: "ONE_TIME" | "MONTHLY" | "YEARLY";
  status: "ACTIVE" | "PAUSED" | "ENDED";
  start_date: string;
}

export interface CustomerSummary {
  active: number;
  /** Bitmemiş anlaşmaların TRY toplamı (tek seferlik + dönemsel tutarın bir dönemi). */
  oneTimeAndActiveTotalTry: number;
  /** Aktif aylık + yıllık/12 anlaşmaların TRY toplamı. */
  monthlyRecurringTry: number;
  newThisMonth: number;
}

/**
 * Müşteriler ekranı özet kartları. Döviz kuru tutulmadığı için yalnızca TRY
 * anlaşmalar parasal toplamlara girer (USD/EUR anlaşmalar listede görünür).
 */
export function summarizeCustomers(deals: Array<DealLike | null>, now: Date): CustomerSummary {
  const monthPrefix = now.toISOString().slice(0, 7);
  let active = 0;
  let total = 0;
  let mrr = 0;
  let newThisMonth = 0;
  for (const deal of deals) {
    if (!deal) continue;
    if (deal.status === "ACTIVE") active += 1;
    if (deal.start_date.startsWith(monthPrefix)) newThisMonth += 1;
    const amount = deal.amount === null ? 0 : Number(deal.amount);
    if (deal.currency !== "TRY" || !Number.isFinite(amount)) continue;
    if (deal.status !== "ENDED") total += amount;
    if (deal.status === "ACTIVE") {
      if (deal.billing === "MONTHLY") mrr += amount;
      if (deal.billing === "YEARLY") mrr += amount / 12;
    }
  }
  return { active, oneTimeAndActiveTotalTry: total, monthlyRecurringTry: Math.round(mrr), newThisMonth };
}
