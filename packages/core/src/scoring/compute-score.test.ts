import { describe, expect, it } from "vitest";
import { computeScore } from "./compute-score";
import type { ScoringInput, ScoringRules } from "./types";

const rules: ScoringRules = {
  version: 3,
  qualifyThreshold: 50,
  rules: {
    NO_WEBSITE: 40,
    BROKEN_WEBSITE: 35,
    LOW_QUALITY_WEBSITE: 25,
    GOOD_WEBSITE: -20,
    NO_BOOKING: 8,
    NO_CONTACT_FORM: 5,
    HIGH_RATING: 8,
    HIGH_REVIEW_COUNT: 10,
    RUNS_ADS: 10,
    HAS_INSTAGRAM: 4,
    HAS_EMAIL: 4,
    HAS_WHATSAPP_MOBILE: 3,
    HAS_PHONE: 2,
    NO_CONTACT_CHANNEL: -30,
  },
};

const baseInput: ScoringInput = {
  websiteStatus: "NO_WEBSITE",
  businessStatus: "OPERATIONAL",
  needsBooking: false,
  hasBookingWidget: false,
  hasContactForm: false,
  rating: null,
  reviewCount: null,
  runsAds: false,
  contacts: { hasInstagram: false, hasEmail: false, hasWhatsappMobile: false, hasPhone: false, hasAnyContact: false },
};

describe("computeScore", () => {
  it("scores a NO_WEBSITE + high review count + phone lead per the SPEC example", () => {
    const input: ScoringInput = {
      ...baseInput,
      reviewCount: 60,
      contacts: { ...baseInput.contacts, hasPhone: true, hasAnyContact: true },
    };
    const result = computeScore(input, rules);
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        { rule: "NO_WEBSITE", points: 40 },
        { rule: "NO_CONTACT_FORM", points: 5 },
        { rule: "HIGH_REVIEW_COUNT", points: 10 },
        { rule: "HAS_PHONE", points: 2 },
      ]),
    );
    expect(result.score).toBe(57);
    expect(result.version).toBe(3);
  });

  it("forces score 0 and DISQUALIFIED-equivalent flag for a non-operational business", () => {
    const input: ScoringInput = { ...baseInput, businessStatus: "CLOSED_PERMANENTLY" };
    const result = computeScore(input, rules);
    expect(result.score).toBe(0);
    expect(result.forceDisqualify).toBe(true);
    expect(result.reasons).toEqual([{ rule: "NOT_OPERATIONAL", points: 0 }]);
  });

  it("applies NO_CONTACT_CHANNEL when there is no contact at all", () => {
    const result = computeScore(baseInput, rules);
    expect(result.reasons).toContainEqual({ rule: "NO_CONTACT_CHANNEL", points: -30 });
  });

  it("does not apply per-channel HAS_* rules together with NO_CONTACT_CHANNEL", () => {
    const result = computeScore(baseInput, rules);
    expect(result.reasons.some((r) => r.rule.startsWith("HAS_"))).toBe(false);
  });

  it("applies NO_BOOKING only when the category needs booking and none is found", () => {
    const needsBookingInput: ScoringInput = { ...baseInput, needsBooking: true, hasBookingWidget: false };
    expect(computeScore(needsBookingInput, rules).reasons).toContainEqual({ rule: "NO_BOOKING", points: 8 });

    const hasBookingInput: ScoringInput = { ...baseInput, needsBooking: true, hasBookingWidget: true };
    expect(computeScore(hasBookingInput, rules).reasons).not.toContainEqual({ rule: "NO_BOOKING", points: 8 });

    const noCategoryInput: ScoringInput = { ...baseInput, needsBooking: false };
    expect(computeScore(noCategoryInput, rules).reasons).not.toContainEqual({ rule: "NO_BOOKING", points: 8 });
  });

  it("clips the score to the 0-100 range", () => {
    const highInput: ScoringInput = {
      ...baseInput,
      websiteStatus: "NO_WEBSITE",
      needsBooking: true,
      hasBookingWidget: false,
      reviewCount: 200,
      rating: 5,
      runsAds: true,
      contacts: { hasInstagram: true, hasEmail: true, hasWhatsappMobile: true, hasPhone: true, hasAnyContact: true },
    };
    const result = computeScore(highInput, rules);
    expect(result.score).toBeLessThanOrEqual(100);

    const lowRules: ScoringRules = { ...rules, rules: { ...rules.rules, GOOD_WEBSITE: -200 } };
    const lowInput: ScoringInput = { ...baseInput, websiteStatus: "GOOD_WEBSITE", hasContactForm: true };
    expect(computeScore(lowInput, lowRules).score).toBe(0);
  });

  it("uses HIGH_RATING/HIGH_REVIEW_COUNT thresholds correctly", () => {
    const belowThreshold: ScoringInput = { ...baseInput, rating: 4.2, reviewCount: 49 };
    const result = computeScore(belowThreshold, rules);
    expect(result.reasons.some((r) => r.rule === "HIGH_RATING")).toBe(false);
    expect(result.reasons.some((r) => r.rule === "HIGH_REVIEW_COUNT")).toBe(false);

    const atThreshold: ScoringInput = { ...baseInput, rating: 4.3, reviewCount: 50 };
    const atResult = computeScore(atThreshold, rules);
    expect(atResult.reasons.some((r) => r.rule === "HIGH_RATING")).toBe(true);
    expect(atResult.reasons.some((r) => r.rule === "HIGH_REVIEW_COUNT")).toBe(true);
  });

  it("falls back to 0 points for a rule missing from workspace scoring_rules", () => {
    const incompleteRules: ScoringRules = { version: 1, qualifyThreshold: 50, rules: {} };
    const result = computeScore(baseInput, incompleteRules);
    expect(result.score).toBe(0);
    expect(result.reasons).toHaveLength(0);
  });
});
