import { describe, expect, it } from "vitest";
import { chooseChannel } from "./choose-channel";
import type { RoutingInput } from "./types";

const now = new Date("2026-09-26T10:00:00+03:00");

const baseInput: RoutingInput = {
  doNotContact: false,
  candidates: [],
  settings: {
    channelPriority: ["EMAIL", "INSTAGRAM", "FACEBOOK", "WHATSAPP", "LINKEDIN", "TIKTOK"],
    channelModes: {
      EMAIL: "DRAFT",
      INSTAGRAM: "ASSISTED",
      FACEBOOK: "ASSISTED",
      WHATSAPP: "ASSISTED",
      LINKEDIN: "MANUAL",
      TIKTOK: "MANUAL",
      PHONE: "MANUAL",
    },
  },
  history: {
    lastMessageAtByChannel: {},
    firstMessageChannelWithin30Days: null,
    dailyCountByChannel: {},
    dailyCountTotal: 0,
  },
  limits: {
    dailyTotal: 40,
    dailyByChannel: { EMAIL: 30, INSTAGRAM: 15, FACEBOOK: 15, WHATSAPP: 10 },
    channelCooldownHours: 72,
  },
  now,
};

describe("chooseChannel", () => {
  it("returns no channel (hard stop) when do_not_contact is true", () => {
    const result = chooseChannel({ ...baseInput, doNotContact: true, candidates: [{ channel: "EMAIL", status: "VALID", confidence: 0.9 }] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.doNotContact).toBe(true);
  });

  it("picks the highest-priority eligible channel", () => {
    const result = chooseChannel({
      ...baseInput,
      candidates: [
        { channel: "INSTAGRAM", status: "VALID", confidence: 0.9 },
        { channel: "EMAIL", status: "VALID", confidence: 0.9 },
      ],
    });
    expect(result).toEqual({ ok: true, channel: "EMAIL", mode: "DRAFT" });
  });

  it("skips a channel with INVALID or BOUNCED status", () => {
    const result = chooseChannel({
      ...baseInput,
      candidates: [
        { channel: "EMAIL", status: "BOUNCED", confidence: 0.9 },
        { channel: "INSTAGRAM", status: "VALID", confidence: 0.9 },
      ],
    });
    expect(result).toEqual({ ok: true, channel: "INSTAGRAM", mode: "ASSISTED" });
  });

  it("skips a channel with confidence below 0.5", () => {
    const result = chooseChannel({
      ...baseInput,
      candidates: [
        { channel: "EMAIL", status: "UNVERIFIED", confidence: 0.4 },
        { channel: "WHATSAPP", status: "VALID", confidence: 0.5 },
      ],
    });
    expect(result).toEqual({ ok: true, channel: "WHATSAPP", mode: "ASSISTED" });
  });

  it("rejects all channels and lists reasons when none are eligible", () => {
    const result = chooseChannel({
      ...baseInput,
      candidates: [{ channel: "EMAIL", status: "INVALID", confidence: 0.9 }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.doNotContact).toBe(false);
      expect(result.reasons).toContainEqual({ channel: "EMAIL", reason: "STATUS_INVALID" });
    }
  });

  it("applies the 72h channel cooldown", () => {
    const recentlyContacted = new Date(now.getTime() - 1000 * 60 * 60 * 10);
    const result = chooseChannel({
      ...baseInput,
      candidates: [{ channel: "EMAIL", status: "VALID", confidence: 0.9 }],
      history: {
        ...baseInput.history,
        lastMessageAtByChannel: { EMAIL: recentlyContacted },
        firstMessageChannelWithin30Days: "EMAIL",
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons).toContainEqual({ channel: "EMAIL", reason: "COOLDOWN" });
  });

  it("allows re-selecting the same channel again after the cooldown window", () => {
    const longAgo = new Date(now.getTime() - 1000 * 60 * 60 * 80);
    const result = chooseChannel({
      ...baseInput,
      candidates: [{ channel: "EMAIL", status: "VALID", confidence: 0.9 }],
      history: {
        ...baseInput.history,
        lastMessageAtByChannel: { EMAIL: longAgo },
        firstMessageChannelWithin30Days: "EMAIL",
      },
    });
    expect(result).toEqual({ ok: true, channel: "EMAIL", mode: "DRAFT" });
  });

  it("rejects a channel once its daily limit is reached", () => {
    const result = chooseChannel({
      ...baseInput,
      candidates: [
        { channel: "EMAIL", status: "VALID", confidence: 0.9 },
        { channel: "INSTAGRAM", status: "VALID", confidence: 0.9 },
      ],
      history: { ...baseInput.history, dailyCountByChannel: { EMAIL: 30 } },
    });
    expect(result).toEqual({ ok: true, channel: "INSTAGRAM", mode: "ASSISTED" });
  });

  it("rejects everything once the daily total limit is reached", () => {
    const result = chooseChannel({
      ...baseInput,
      candidates: [{ channel: "EMAIL", status: "VALID", confidence: 0.9 }],
      history: { ...baseInput.history, dailyCountTotal: 40 },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons).toContainEqual({ channel: "EMAIL", reason: "DAILY_TOTAL_LIMIT" });
  });

  it("does not switch to a second channel just because it's next in priority when the first channel already made contact", () => {
    const result = chooseChannel({
      ...baseInput,
      candidates: [
        { channel: "EMAIL", status: "VALID", confidence: 0.9 },
        { channel: "INSTAGRAM", status: "VALID", confidence: 0.9 },
      ],
      history: {
        ...baseInput.history,
        lastMessageAtByChannel: { EMAIL: new Date(now.getTime() - 1000 * 60 * 60 * 10) },
        firstMessageChannelWithin30Days: "EMAIL",
      },
    });
    // EMAIL is in cooldown, INSTAGRAM hasn't been contacted and EMAIL already
    // established contact -> INSTAGRAM is not picked as a silent fallback.
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reasons).toContainEqual({ channel: "INSTAGRAM", reason: "OTHER_CHANNEL_ALREADY_CONTACTED" });
    }
  });

  it("returns an empty candidate list as a full rejection with no reasons", () => {
    const result = chooseChannel({ ...baseInput, candidates: [] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons).toHaveLength(0);
  });
});
