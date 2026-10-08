import { describe, expect, it } from "vitest";
import { dateFromInput, followUpDate } from "./contact-attempts";

describe("followUpDate", () => {
  it("verilen gün sonrasının 10:00'unu (yerel saat) döner", () => {
    const date = followUpDate(3, new Date(2026, 9, 8, 21, 45, 12));

    expect([date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(), date.getMinutes()]).toEqual([2026, 9, 11, 10, 0]);
  });

  it("ay sonunu aşar", () => {
    const date = followUpDate(2, new Date(2026, 9, 30, 8, 0, 0));

    expect([date.getMonth(), date.getDate()]).toEqual([10, 1]);
  });

  it("girdi tarihini değiştirmez", () => {
    const now = new Date(2026, 9, 8, 21, 45, 0);

    followUpDate(5, now);

    expect(now.getDate()).toBe(8);
  });
});

describe("dateFromInput", () => {
  it("YYYY-MM-DD'yi yerel 10:00 olarak çevirir", () => {
    const date = dateFromInput("2026-11-02");

    expect([date?.getFullYear(), date?.getMonth(), date?.getDate(), date?.getHours()]).toEqual([2026, 10, 2, 10]);
  });

  it("boş veya bozuk girdide null döner", () => {
    expect(dateFromInput("")).toBeNull();
    expect(dateFromInput("02.11.2026")).toBeNull();
    expect(dateFromInput("2026-13-45")).toBeNull();
    expect(dateFromInput("2026-02-30")).toBeNull();
  });
});
