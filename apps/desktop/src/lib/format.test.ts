import { describe, expect, it } from "vitest";
import { formatDateTime, formatLocalTime, formatMoneyTotals, formatRelative, greetingForHour } from "./format";

describe("formatRelative", () => {
  const now = new Date("2026-09-27T12:00:00Z");

  it("formats recent times in minutes and hours", () => {
    expect(formatRelative("2026-09-27T11:59:30Z", now)).toBe("az önce");
    expect(formatRelative("2026-09-27T11:40:00Z", now)).toBe("20 dk önce");
    expect(formatRelative("2026-09-27T09:00:00Z", now)).toBe("3 saat önce");
  });

  it("formats yesterday and days", () => {
    expect(formatRelative("2026-09-26T10:00:00Z", now)).toBe("dün");
    expect(formatRelative("2026-09-24T10:00:00Z", now)).toBe("3 gün önce");
  });
});

describe("greetingForHour", () => {
  it("maps hours to greetings", () => {
    expect(greetingForHour(8)).toBe("morning");
    expect(greetingForHour(14)).toBe("afternoon");
    expect(greetingForHour(22)).toBe("evening");
    expect(greetingForHour(3)).toBe("evening");
  });
});

describe("formatLocalTime / formatMoneyTotals / saat dilimli tarih", () => {
  it("işletmenin yerel saatini verir", () => {
    const now = new Date("2026-03-04T12:00:00Z");
    expect(formatLocalTime("America/Los_Angeles", now)).toContain("04:00");
    expect(formatLocalTime("Australia/Sydney", now)).toContain("23:00");
    expect(formatLocalTime("Not/AZone", now)).toBe("");
  });

  it("toplamları para birimine göre ayrı yazar", () => {
    expect(formatMoneyTotals({})).toBe("—");
    expect(formatMoneyTotals({ TRY: 0 })).toBe("—");
    const text = formatMoneyTotals({ USD: 500, TRY: 1000 });
    expect(text).toContain("·");
    expect(text).toMatch(/1\.000/);
    expect(text).toMatch(/500/);
  });

  it("formatDateTime saat dilimi parametresi verilince o dilimde yazar", () => {
    const iso = "2026-03-04T23:30:00Z";
    expect(formatDateTime(iso, "Australia/Sydney")).toContain("10:30");
    expect(formatDateTime(iso)).toContain("02:30");
  });
});
