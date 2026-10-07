import { trigramSimilarity } from "./string-similarity";

export interface DedupeCandidate {
  id: string;
  googlePlaceId?: string | null;
  websiteDomain?: string | null;
  phoneE164?: string | null;
  instagram?: string | null;
  facebook?: string | null;
  email?: string | null;
  normalizedName: string;
  district?: string | null;
  /** ISO-3166 alpha-2; bilinmiyorsa (eski kayıt) ülke kapsamı uygulanmaz. */
  countryCode?: string | null;
}

export type MatchType = "EXACT" | "POSSIBLE" | "NONE";

export interface MatchResult {
  type: MatchType;
  matchedId?: string;
}

const FUZZY_NAME_THRESHOLD = 0.9;

/**
 * SPEC.md → G.4'teki eşleştirme sırasının saf TS karşılığı. Yalnızca CSV
 * import sihirbazının önizleme adımında (UX) kullanılır; asıl yetkili
 * eşleştirme `find_duplicate_business()`/`find_possible_duplicate_business()`
 * SQL fonksiyonlarındadır (istemciye güvenilmez ilkesi).
 */
export function classifyMatch(
  candidate: Omit<DedupeCandidate, "id">,
  existing: DedupeCandidate[],
): MatchResult {
  const exactTiers: Array<(c: typeof candidate, o: DedupeCandidate) => boolean> = [
    (c, o) => !!c.googlePlaceId && c.googlePlaceId === o.googlePlaceId,
    (c, o) => !!c.websiteDomain && c.websiteDomain === o.websiteDomain,
    (c, o) => !!c.phoneE164 && c.phoneE164 === o.phoneE164,
    (c, o) => !!c.instagram && c.instagram === o.instagram,
    (c, o) => !!c.facebook && c.facebook === o.facebook,
    (c, o) => !!c.email && c.email === o.email,
  ];

  for (const matches of exactTiers) {
    const found = existing.find((o) => matches(candidate, o));
    if (found) return { type: "EXACT", matchedId: found.id };
  }

  const possible = existing.find(
    (o) =>
      !!candidate.district &&
      candidate.district === o.district &&
      (!candidate.countryCode || !o.countryCode || candidate.countryCode === o.countryCode) &&
      trigramSimilarity(candidate.normalizedName, o.normalizedName) >= FUZZY_NAME_THRESHOLD,
  );
  if (possible) return { type: "POSSIBLE", matchedId: possible.id };

  return { type: "NONE" };
}
