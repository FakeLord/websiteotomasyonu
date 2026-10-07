import { describe, expect, it } from "vitest";
import { defaultDealCurrency, summarizeCustomers, type DealLike } from "./customer-metrics";

const deal = (overrides: Partial<DealLike>): DealLike => ({
  amount: 1000,
  currency: "TRY",
  billing: "ONE_TIME",
  status: "ACTIVE",
  start_date: "2026-09-10",
  ...overrides,
});

describe("summarizeCustomers", () => {
  it("sums TRY totals, derives MRR from monthly and yearly deals, ignores ended deals", () => {
    const summary = summarizeCustomers(
      [
        deal({ amount: 15000 }),
        deal({ amount: 2000, billing: "MONTHLY" }),
        deal({ amount: 12000, billing: "YEARLY", start_date: "2026-08-01" }),
        deal({ amount: 9000, status: "ENDED" }),
        deal({ amount: "500", currency: "USD", billing: "MONTHLY" }),
        null,
      ],
      new Date("2026-09-27T10:00:00Z"),
    );
    expect(summary.active).toBe(4);
    expect(summary.oneTimeAndActiveTotalTry).toBe(29000);
    expect(summary.monthlyRecurringTry).toBe(3000);
    expect(summary.newThisMonth).toBe(4);
  });
});

describe("summarizeCustomers — para birimine göre toplamlar", () => {
  it("her para birimini ayrı toplar, kur dönüşümü yapmaz", () => {
    const deals = [
      { amount: 1000, currency: "TRY", billing: "MONTHLY", status: "ACTIVE", start_date: "2026-03-02" },
      { amount: 500, currency: "USD", billing: "MONTHLY", status: "ACTIVE", start_date: "2026-03-03" },
      { amount: 1200, currency: "GBP", billing: "YEARLY", status: "ACTIVE", start_date: "2026-03-04" },
      { amount: 900, currency: "AUD", billing: "ONE_TIME", status: "ENDED", start_date: "2026-03-05" },
    ] as const;
    const summary = summarizeCustomers([...deals], new Date("2026-03-15T00:00:00Z"));
    expect(summary.totalsByCurrency).toEqual({ TRY: 1000, USD: 500, GBP: 1200 });
    expect(summary.mrrByCurrency).toEqual({ TRY: 1000, USD: 500, GBP: 100 });
    expect(summary.monthlyRecurringTry).toBe(1000);
  });
});

describe("defaultDealCurrency", () => {
  it("ülkeye göre para birimi seçer, bilinmeyende TRY", () => {
    expect(defaultDealCurrency("US")).toBe("USD");
    expect(defaultDealCurrency("gb")).toBe("GBP");
    expect(defaultDealCurrency("CA")).toBe("CAD");
    expect(defaultDealCurrency("AU")).toBe("AUD");
    expect(defaultDealCurrency("TR")).toBe("TRY");
    expect(defaultDealCurrency("DE")).toBe("TRY");
    expect(defaultDealCurrency(undefined)).toBe("TRY");
  });
});
