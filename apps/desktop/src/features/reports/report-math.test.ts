import { describe, expect, it } from "vitest";
import { funnelSteps, rangeForPreset } from "./report-math";

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
