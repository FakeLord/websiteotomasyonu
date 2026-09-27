import { describe, expect, it } from "vitest";
import { formatRelative, greetingForHour } from "./format";

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
