import { tr } from "../../../i18n/tr";

export interface LeadSummaryInput {
  websiteStatus: string | null;
  rating: number | null;
  reviewCount: number | null;
  channelCount: number;
  score: number;
}

/**
 * Lead için kısa, deterministik bir durum özeti (AI çağrısı yapmadan; website
 * analizi ve skor zaten deterministik koddan geliyor — SPEC.md → J.2).
 */
export function buildLeadSummary(input: LeadSummaryInput): string {
  const parts: string[] = [];
  const website = tr.leadSummary.website[input.websiteStatus as keyof typeof tr.leadSummary.website];
  parts.push(website ?? tr.leadSummary.websiteUnknown);

  if (input.rating !== null && input.rating >= 4.3 && (input.reviewCount ?? 0) >= 30) {
    parts.push(tr.leadSummary.strongReputation(input.rating, input.reviewCount ?? 0));
  } else if (input.rating !== null) {
    parts.push(tr.leadSummary.rating(input.rating, input.reviewCount ?? 0));
  }

  parts.push(input.channelCount > 0 ? tr.leadSummary.channels(input.channelCount) : tr.leadSummary.noChannels);

  if (input.score >= 70) parts.push(tr.leadSummary.strong);
  else if (input.score >= 40) parts.push(tr.leadSummary.medium);
  else parts.push(tr.leadSummary.weak);

  return parts.join(" ");
}
