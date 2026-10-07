export type DealCurrency = "TRY" | "USD" | "EUR" | "GBP" | "CAD" | "AUD";
export const DEAL_CURRENCIES: DealCurrency[] = ["TRY", "USD", "EUR", "GBP", "CAD", "AUD"];

/** İşletmenin ülkesine göre yeni anlaşmanın varsayılan para birimi (bilinmiyorsa TRY: eski davranış). */
export function defaultDealCurrency(countryCode: string | undefined): DealCurrency {
  const byCountry: Record<string, DealCurrency> = { US: "USD", GB: "GBP", CA: "CAD", AU: "AUD", TR: "TRY" };
  return (countryCode && byCountry[countryCode.toUpperCase()]) || "TRY";
}

export interface DealLike {
  amount: number | string | null;
  currency: DealCurrency;
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
  /** Para birimine göre bitmemiş anlaşma toplamları (kur dönüşümü yapılmaz). */
  totalsByCurrency: Record<string, number>;
  /** Para birimine göre aktif aylık + yıllık/12 toplamları. */
  mrrByCurrency: Record<string, number>;
}

/**
 * Müşteriler ekranı özet kartları. Döviz kuru tutulmadığı için toplamlar para
 * birimine göre ayrı tutulur (`*ByCurrency`); eski TRY alanları geriye uyumluluk içindir.
 */
export function summarizeCustomers(deals: Array<DealLike | null>, now: Date): CustomerSummary {
  const monthPrefix = now.toISOString().slice(0, 7);
  let active = 0;
  let total = 0;
  let mrr = 0;
  let newThisMonth = 0;
  const totalsByCurrency: Record<string, number> = {};
  const mrrByCurrency: Record<string, number> = {};
  for (const deal of deals) {
    if (!deal) continue;
    if (deal.status === "ACTIVE") active += 1;
    if (deal.start_date.startsWith(monthPrefix)) newThisMonth += 1;
    const amount = deal.amount === null ? 0 : Number(deal.amount);
    if (!Number.isFinite(amount)) continue;
    const monthly = deal.status === "ACTIVE" ? (deal.billing === "MONTHLY" ? amount : deal.billing === "YEARLY" ? amount / 12 : 0) : 0;
    if (deal.status !== "ENDED") totalsByCurrency[deal.currency] = (totalsByCurrency[deal.currency] ?? 0) + amount;
    if (monthly) mrrByCurrency[deal.currency] = (mrrByCurrency[deal.currency] ?? 0) + monthly;
    if (deal.currency !== "TRY") continue;
    if (deal.status !== "ENDED") total += amount;
    mrr += monthly;
  }
  for (const [currency, value] of Object.entries(mrrByCurrency)) mrrByCurrency[currency] = Math.round(value);
  return { active, oneTimeAndActiveTotalTry: total, monthlyRecurringTry: Math.round(mrr), newThisMonth, totalsByCurrency, mrrByCurrency };
}
