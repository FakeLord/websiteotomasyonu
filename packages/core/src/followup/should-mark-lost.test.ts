import { describe, expect, it } from "vitest";
import { NO_RESPONSE_GRACE_DAYS, shouldMarkLostNoResponse, type SequenceState } from "./should-mark-lost";

const now = new Date("2026-10-20T10:00:00Z");
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);

const base: SequenceState = {
  stage: "CONTACTED",
  afterSequence: "MARK_LOST_NO_RESPONSE",
  policySteps: 2,
  followUps: [
    { step: 1, status: "SENT" },
    { step: 2, status: "SENT" },
  ],
  lastOutboundAt: daysAgo(8),
  hasReplySinceFirstContact: false,
};

describe("shouldMarkLostNoResponse", () => {
  it("marks LOST when the sequence is finished and 7 days passed without a reply", () => {
    expect(NO_RESPONSE_GRACE_DAYS).toBe(7);
    expect(shouldMarkLostNoResponse(base, now)).toBe(true);
  });

  it("counts skipped steps as finished", () => {
    expect(shouldMarkLostNoResponse({ ...base, followUps: [{ step: 1, status: "SENT" }, { step: 2, status: "SKIPPED" }] }, now)).toBe(true);
  });

  it("waits while a step is still pending or drafted", () => {
    expect(shouldMarkLostNoResponse({ ...base, followUps: [{ step: 1, status: "SENT" }, { step: 2, status: "DRAFTED" }] }, now)).toBe(false);
  });

  it("waits until every policy step has run", () => {
    expect(shouldMarkLostNoResponse({ ...base, followUps: [{ step: 1, status: "SENT" }] }, now)).toBe(false);
  });

  it("waits the 7-day grace period after the last message", () => {
    expect(shouldMarkLostNoResponse({ ...base, lastOutboundAt: daysAgo(6) }, now)).toBe(false);
  });

  it("never closes a lead that replied, left CONTACTED, or when the policy says so", () => {
    expect(shouldMarkLostNoResponse({ ...base, hasReplySinceFirstContact: true }, now)).toBe(false);
    expect(shouldMarkLostNoResponse({ ...base, stage: "REPLIED" }, now)).toBe(false);
    expect(shouldMarkLostNoResponse({ ...base, afterSequence: "KEEP" }, now)).toBe(false);
    expect(shouldMarkLostNoResponse({ ...base, lastOutboundAt: null }, now)).toBe(false);
  });

  it("does not close a sequence that was stopped (cancelled) rather than finished", () => {
    expect(shouldMarkLostNoResponse({ ...base, followUps: [{ step: 1, status: "SENT" }, { step: 2, status: "CANCELLED" }] }, now)).toBe(false);
  });
});
