import { describe, expect, it } from "vitest";
import { allowedNextStages, BUSINESS_STAGES, isValidTransition } from "./stage";

describe("isValidTransition", () => {
  it.each([
    ["NEW", "QUALIFIED"],
    ["NEW", "DISQUALIFIED"],
    ["QUALIFIED", "OUTREACH_READY"],
    ["OUTREACH_READY", "CONTACTED"],
    ["CONTACTED", "REPLIED"],
    ["CONTACTED", "LOST"],
    ["REPLIED", "ENGAGED"],
    ["ENGAGED", "PROPOSAL_READY"],
    ["PROPOSAL_READY", "HANDED_OFF"],
    ["HANDED_OFF", "WON"],
    ["HANDED_OFF", "LOST"],
    ["LOST", "QUALIFIED"],
  ] as const)("allows %s -> %s", (from, to) => {
    expect(isValidTransition(from, to)).toBe(true);
  });

  it.each([
    ["NEW", "WON"],
    ["QUALIFIED", "HANDED_OFF"],
    ["WON", "LOST"],
    ["DISQUALIFIED", "NEW"],
    ["LOST", "WON"],
  ] as const)("rejects %s -> %s", (from, to) => {
    expect(isValidTransition(from, to)).toBe(false);
  });

  it("has an entry for every known stage", () => {
    for (const stage of BUSINESS_STAGES) {
      expect(() => allowedNextStages(stage)).not.toThrow();
    }
  });

  it("WON and DISQUALIFIED are terminal (no outgoing transitions)", () => {
    expect(allowedNextStages("WON")).toHaveLength(0);
    expect(allowedNextStages("DISQUALIFIED")).toHaveLength(0);
  });
});
