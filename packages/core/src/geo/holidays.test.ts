import { describe, expect, it } from "vitest";
import { isHoliday } from "./holidays";

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe("isHoliday — ABD (federal)", () => {
  it("sabit ve hareketli tatilleri tanır", () => {
    expect(isHoliday(d("2026-05-25"), "US")).toBe(true); // Memorial Day
    expect(isHoliday(d("2026-11-26"), "US")).toBe(true); // Thanksgiving
    expect(isHoliday(d("2026-12-25"), "US")).toBe(true);
    expect(isHoliday(d("2026-09-07"), "US")).toBe(true); // Labor Day
  });
  it("Cumartesi'ye denk gelen 4 Temmuz Cuma'ya kaydırılır", () => {
    expect(isHoliday(d("2026-07-03"), "US")).toBe(true);
  });
  it("sıradan günü tatil saymaz", () => {
    expect(isHoliday(d("2026-03-10"), "US")).toBe(false);
  });
});

describe("isHoliday — İngiltere", () => {
  it("Paskalya tatillerini ve banka tatillerini tanır", () => {
    expect(isHoliday(d("2026-04-03"), "GB")).toBe(true); // Good Friday
    expect(isHoliday(d("2026-04-06"), "GB")).toBe(true); // Easter Monday
    expect(isHoliday(d("2026-05-04"), "GB")).toBe(true); // Early May
    expect(isHoliday(d("2026-05-25"), "GB")).toBe(true); // Spring
    expect(isHoliday(d("2026-08-31"), "GB")).toBe(true); // Summer
  });
  it("Cumartesi'ye düşen Boxing Day için ikame Pazartesi tatildir", () => {
    expect(isHoliday(d("2026-12-25"), "GB")).toBe(true);
    expect(isHoliday(d("2026-12-28"), "GB")).toBe(true);
  });
});

describe("isHoliday — Kanada (federal)", () => {
  it("Victoria Day, Canada Day, Thanksgiving", () => {
    expect(isHoliday(d("2026-05-18"), "CA")).toBe(true);
    expect(isHoliday(d("2026-07-01"), "CA")).toBe(true);
    expect(isHoliday(d("2026-10-12"), "CA")).toBe(true);
    expect(isHoliday(d("2026-09-30"), "CA")).toBe(true);
  });
  it("ABD'ye özgü Thanksgiving Kanada'da tatil değildir", () => {
    expect(isHoliday(d("2026-11-26"), "CA")).toBe(false);
  });
});

describe("isHoliday — Avustralya (ulusal)", () => {
  it("Australia Day, Easter Monday, Anzac Day, ikame Boxing Day", () => {
    expect(isHoliday(d("2026-01-26"), "AU")).toBe(true);
    expect(isHoliday(d("2026-04-06"), "AU")).toBe(true);
    expect(isHoliday(d("2026-04-25"), "AU")).toBe(true);
    expect(isHoliday(d("2026-12-28"), "AU")).toBe(true);
  });
});

describe("isHoliday — Türkiye", () => {
  it("sabit ve 2026 dinî bayramları (mevcut davranış korunur)", () => {
    expect(isHoliday(d("2026-10-29"), "TR")).toBe(true);
    expect(isHoliday(d("2026-03-20"), "TR")).toBe(true);
    expect(isHoliday(d("2026-05-27"), "TR")).toBe(true);
    expect(isHoliday(d("2026-03-10"), "TR")).toBe(false);
  });
  it("2027'de Ramazan Bayramı yaklaşık olarak Mart başında, Kurban Mayıs ortasında bulunur", () => {
    const march = ["2027-03-08", "2027-03-09", "2027-03-10", "2027-03-11"].filter((x) => isHoliday(d(x), "TR"));
    const may = ["2027-05-15", "2027-05-16", "2027-05-17", "2027-05-18"].filter((x) => isHoliday(d(x), "TR"));
    expect(march.length).toBeGreaterThanOrEqual(2);
    expect(may.length).toBeGreaterThanOrEqual(2);
    expect(isHoliday(d("2027-02-10"), "TR")).toBe(false);
  });
});

describe("isHoliday — diğer", () => {
  it("bilinmeyen ülkede tatil sayılmaz; küçük harfli kod kabul edilir", () => {
    expect(isHoliday(d("2026-12-25"), "DE")).toBe(false);
    expect(isHoliday(d("2026-12-25"), "us")).toBe(true);
  });
});
