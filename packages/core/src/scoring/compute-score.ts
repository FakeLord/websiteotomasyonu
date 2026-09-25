import type { ScoreReason, ScoreResult, ScoringInput, ScoringRules } from "./types";

const HIGH_RATING_THRESHOLD = 4.3;
const HIGH_REVIEW_COUNT_THRESHOLD = 50;

function rulePoints(rules: ScoringRules, name: string): number {
  return rules.rules[name] ?? 0;
}

/**
 * I.1 bölümündeki skor tablosunun saf uygulaması. Kurallar
 * `workspace_settings.scoring_rules`'dan gelir (admin UI'dan değiştirilebilir,
 * `version` artınca tüm lead'ler yeniden hesaplanır). Aynı girdi her zaman
 * aynı sonucu verir (SPEC.md → I).
 */
export function computeScore(input: ScoringInput, rules: ScoringRules): ScoreResult {
  if (input.businessStatus && input.businessStatus !== "OPERATIONAL") {
    return {
      score: 0,
      version: rules.version,
      reasons: [{ rule: "NOT_OPERATIONAL", points: 0 }],
      forceDisqualify: true,
    };
  }

  const reasons: ScoreReason[] = [];
  const add = (rule: string) => {
    const points = rulePoints(rules, rule);
    if (points !== 0) reasons.push({ rule, points });
  };

  if (input.websiteStatus === "NO_WEBSITE") add("NO_WEBSITE");
  else if (input.websiteStatus === "BROKEN_WEBSITE") add("BROKEN_WEBSITE");
  else if (input.websiteStatus === "LOW_QUALITY_WEBSITE") add("LOW_QUALITY_WEBSITE");
  else if (input.websiteStatus === "GOOD_WEBSITE") add("GOOD_WEBSITE");

  if (input.needsBooking && !input.hasBookingWidget) add("NO_BOOKING");
  if (!input.hasContactForm) add("NO_CONTACT_FORM");
  if (input.rating != null && input.rating >= HIGH_RATING_THRESHOLD) add("HIGH_RATING");
  if (input.reviewCount != null && input.reviewCount >= HIGH_REVIEW_COUNT_THRESHOLD) add("HIGH_REVIEW_COUNT");
  if (input.runsAds) add("RUNS_ADS");

  if (input.contacts.hasAnyContact) {
    if (input.contacts.hasInstagram) add("HAS_INSTAGRAM");
    if (input.contacts.hasEmail) add("HAS_EMAIL");
    if (input.contacts.hasWhatsappMobile) add("HAS_WHATSAPP_MOBILE");
    if (input.contacts.hasPhone) add("HAS_PHONE");
  } else {
    add("NO_CONTACT_CHANNEL");
  }

  const rawScore = reasons.reduce((sum, r) => sum + r.points, 0);
  const score = Math.max(0, Math.min(100, rawScore));

  return { score, version: rules.version, reasons, forceDisqualify: false };
}
