import { describe, expect, it } from "vitest";
import { shouldCancelFollowUps, type FollowUpCancelInput } from "./should-cancel-followups";

const base: FollowUpCancelInput = {
  stage: "CONTACTED",
  doNotContact: false,
  channelStatus: "VALID",
  hasNewInboundMessage: false,
};

describe("shouldCancelFollowUps", () => {
  it("does not cancel for a normal CONTACTED lead with no new message", () => {
    expect(shouldCancelFollowUps(base)).toBe(false);
  });

  it("cancels when a new inbound message arrived", () => {
    expect(shouldCancelFollowUps({ ...base, hasNewInboundMessage: true })).toBe(true);
  });

  it("does not cancel for an automatic reply (SPEC → L: AUTO_REPLY only postpones)", () => {
    expect(shouldCancelFollowUps({ ...base, hasNewInboundMessage: true, inboundIsAutoReply: true })).toBe(false);
  });

  it.each(["ENGAGED", "PROPOSAL_READY", "HANDED_OFF", "WON", "LOST", "DISQUALIFIED"] as const)(
    "cancels when stage is %s",
    (stage) => {
      expect(shouldCancelFollowUps({ ...base, stage })).toBe(true);
    },
  );

  it("does not cancel for REPLIED or CONTACTED stages", () => {
    expect(shouldCancelFollowUps({ ...base, stage: "REPLIED" })).toBe(false);
    expect(shouldCancelFollowUps({ ...base, stage: "CONTACTED" })).toBe(false);
  });

  it("cancels when do_not_contact is true", () => {
    expect(shouldCancelFollowUps({ ...base, doNotContact: true })).toBe(true);
  });

  it("cancels when the channel is INVALID or BOUNCED", () => {
    expect(shouldCancelFollowUps({ ...base, channelStatus: "INVALID" })).toBe(true);
    expect(shouldCancelFollowUps({ ...base, channelStatus: "BOUNCED" })).toBe(true);
  });

  it("does not cancel for an UNVERIFIED channel", () => {
    expect(shouldCancelFollowUps({ ...base, channelStatus: "UNVERIFIED" })).toBe(false);
  });
});
