import type { WebsiteStatus } from "../website-analyzer/types";

export interface ScoringRules {
  version: number;
  qualifyThreshold: number;
  rules: Record<string, number>;
}

export interface ScoringContactSignals {
  hasInstagram: boolean;
  hasEmail: boolean;
  hasWhatsappMobile: boolean;
  hasPhone: boolean;
  hasAnyContact: boolean;
}

export interface ScoringInput {
  websiteStatus: WebsiteStatus | null;
  businessStatus: "OPERATIONAL" | "CLOSED_TEMPORARILY" | "CLOSED_PERMANENTLY" | null;
  needsBooking: boolean;
  hasBookingWidget: boolean;
  hasContactForm: boolean;
  rating: number | null;
  reviewCount: number | null;
  runsAds: boolean;
  contacts: ScoringContactSignals;
}

export interface ScoreReason {
  rule: string;
  points: number;
}

export interface ScoreResult {
  score: number;
  version: number;
  reasons: ScoreReason[];
  forceDisqualify: boolean;
}
