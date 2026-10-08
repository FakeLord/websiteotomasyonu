import { describe, expect, it } from "vitest";
import { bestSegment, funnelSteps, mergeSegments, rangeForPreset, segmentRate } from "./report-math";

describe("funnelSteps", () => {
  it("computes share of top and step-to-step conversion", () => {
    const steps = funnelSteps({ found: 200, contacted: 50, replied: 10, engaged: 5, proposal: 2, won: 1 });
    expect(steps[0]).toEqual({ key: "found", value: 200, ofTop: 100, fromPrevious: null });
    expect(steps[1]).toMatchObject({ key: "contacted", ofTop: 25, fromPrevious: 25 });
    expect(steps[2]).toMatchObject({ key: "replied", fromPrevious: 20 });
    expect(steps[5]).toMatchObject({ key: "won", fromPrevious: 50 });
  });

  it("handles an empty funnel without dividing by zero", () => {
    const steps = funnelSteps({ found: 0, contacted: 0, replied: 0, engaged: 0, proposal: 0, won: 0 });
    expect(steps.every((s) => s.ofTop === 0)).toBe(true);
    expect(steps[1]?.fromPrevious).toBe(0);
  });
});

describe("rangeForPreset", () => {
  it("builds inclusive day ranges", () => {
    const today = new Date(2026, 8, 27);
    expect(rangeForPreset("7", today)).toEqual({ from: "2026-09-21", to: "2026-09-27" });
    expect(rangeForPreset("month", today)).toEqual({ from: "2026-09-01", to: "2026-09-27" });
  });
});

describe("segmentRate", () => {
  it("yeterli örnekte oranı yüzde olarak verir", () => {
    expect(segmentRate(40, 6)).toEqual({ percent: 15, enough: true });
  });

  it("örnek az olduğunda (20'den az yazılan) oranı güvenilmez işaretler", () => {
    expect(segmentRate(10, 4)).toEqual({ percent: 40, enough: false });
    expect(segmentRate(19, 19).enough).toBe(false);
    expect(segmentRate(20, 2).enough).toBe(true);
  });

  it("hiç yazılmamışsa oran yoktur", () => {
    expect(segmentRate(0, 0)).toEqual({ percent: null, enough: false });
  });
});

describe("bestSegment", () => {
  const rows = [
    { key: "Diş Kliniği", contacted: 40, replied: 8 },
    { key: "Veteriner", contacted: 25, replied: 10 },
    { key: "Kafe", contacted: 5, replied: 5 },
    { key: "Berber", contacted: 30, replied: 0 },
  ];

  it("yalnızca yeterli örneği olanlar arasında en yüksek cevap oranlıyı seçer", () => {
    expect(bestSegment(rows)?.key).toBe("Veteriner");
  });

  it("hiçbir segmentte yeterli örnek yoksa null döner", () => {
    expect(bestSegment([{ key: "Kafe", contacted: 5, replied: 5 }])).toBeNull();
  });

  it("cevap yoksa en iyi segment seçilmez", () => {
    expect(bestSegment([{ key: "Berber", contacted: 30, replied: 0 }])).toBeNull();
  });
});

describe("mergeSegments", () => {
  const row = (key: string, found: number, contacted: number, replied: number) => ({ key, found, opportunities: 1, contacted, replied, won: 0 });
  const canonical = (key: string) => (key === "Dentist" ? "Diş Kliniği" : key);

  it("aynı sektörün farklı yazımlarını toplar", () => {
    const merged = mergeSegments([row("Diş Kliniği", 10, 4, 1), row("Dentist", 3, 2, 1), row("Kafe", 5, 0, 0)], canonical);

    expect(merged).toEqual([
      { key: "Diş Kliniği", found: 13, opportunities: 2, contacted: 6, replied: 2, won: 0 },
      { key: "Kafe", found: 5, opportunities: 1, contacted: 0, replied: 0, won: 0 },
    ]);
  });

  it("girdiyi değiştirmez", () => {
    const input = [row("Diş Kliniği", 10, 4, 1), row("Dentist", 3, 2, 1)];

    mergeSegments(input, canonical);

    expect(input[0]?.found).toBe(10);
  });
});
