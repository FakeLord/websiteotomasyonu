import { describe, expect, it } from "vitest";
import { summarizeCustomers, type DealLike } from "./customer-metrics";

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
