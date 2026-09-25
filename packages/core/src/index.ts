export { normalizeDomain } from "./normalize-domain";
export { normalizePhone, type NormalizedPhone } from "./dedupe/normalize-phone";
export { normalizeSocial, type SocialPlatform } from "./dedupe/normalize-social";
export { trigramSimilarity } from "./dedupe/string-similarity";
export {
  classifyMatch,
  type DedupeCandidate,
  type MatchResult,
  type MatchType,
} from "./dedupe/classify-match";
export {
  BUSINESS_STAGES,
  isValidTransition,
  allowedNextStages,
  type BusinessStage,
} from "./pipeline/stage";
