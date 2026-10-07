import { describe, expect, it } from "vitest";
import { computeFollowUpDueDate } from "./compute-due-date";

const window = { days: [1, 2, 3, 4, 5], from: "09:00" };

describe("computeFollowUpDueDate — saat dilimi ve ülke", () => {
  it("aynı anda Sydney ve Los Angeles için farklı yerel 09:00 anı üretir", () => {
    // Çarşamba 2026-03-04 12:00 UTC; +1 gün → Perşembe.
    const base = new Date("2026-03-04T12:00:00Z");
    const sydney = computeFollowUpDueDate(base, 1, window, false, { timeZone: "Australia/Sydney", countryCode: "AU" });
    const la = computeFollowUpDueDate(base, 1, window, false, { timeZone: "America/Los_Angeles", countryCode: "US" });
    // Sydney Mart'ta UTC+11 (yaz saati), Los Angeles UTC-8 (kış saati; ABD yaz saati 8 Mart'ta başlar).
    expect(sydney.toISOString()).toBe("2026-03-04T22:00:00.000Z"); // 5 Mart 09:00 Sydney = 4 Mart 22:00 UTC
    expect(la.toISOString()).toBe("2026-03-05T17:00:00.000Z"); // 5 Mart 09:00 PST
  });

  it("yaz saati geçişinden sonra yerel saat 09:00 kalır", () => {
    const base = new Date("2026-03-06T12:00:00Z"); // Cuma
    const la = computeFollowUpDueDate(base, 3, window, false, { timeZone: "America/Los_Angeles", countryCode: "US" });
    // 9 Mart Pazartesi, ABD yaz saati (PDT, UTC-7) başladı → 09:00 PDT = 16:00 UTC.
    expect(la.toISOString()).toBe("2026-03-09T16:00:00.000Z");
  });

  it("temel günün takvim tarihi işletmenin saat diliminde alınır", () => {
    // 2026-03-04 23:30 UTC = Sydney'de 5 Mart 10:30; +1 gün → 6 Mart Cuma.
    const base = new Date("2026-03-04T23:30:00Z");
    const sydney = computeFollowUpDueDate(base, 1, window, false, { timeZone: "Australia/Sydney", countryCode: "AU" });
    expect(sydney.toISOString()).toBe("2026-03-05T22:00:00.000Z"); // 6 Mart 09:00 Sydney
  });

  it("tatilleri işletmenin ülkesine göre atlar (4 Temmuz ABD'de tatil, İngiltere'de değil)", () => {
    // 2025-07-03 Perşembe; +1 gün → 4 Temmuz Cuma.
    const base = new Date("2025-07-03T12:00:00Z");
    const us = computeFollowUpDueDate(base, 1, window, true, { timeZone: "America/New_York", countryCode: "US" });
    const gb = computeFollowUpDueDate(base, 1, window, true, { timeZone: "Europe/London", countryCode: "GB" });
    expect(us.toISOString()).toBe("2025-07-07T13:00:00.000Z"); // Pazartesi 09:00 EDT
    expect(gb.toISOString()).toBe("2025-07-04T08:00:00.000Z"); // Cuma 09:00 BST
  });

  it("opts verilmezse eski İstanbul/TR davranışı korunur", () => {
    const base = new Date("2026-10-28T09:00:00Z"); // Çarşamba; +1 → 29 Ekim (Cumhuriyet Bayramı)
    const due = computeFollowUpDueDate(base, 1, window, true);
    expect(due.toISOString()).toBe("2026-10-30T06:00:00.000Z"); // 30 Ekim Cuma 09:00 İstanbul
  });
});
