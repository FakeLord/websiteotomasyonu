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
export { placeToBusinessPayload, type GooglePlaceResult, type PlaceToBusinessPayload } from "./discovery/place-to-business";
export {
  runSearchJob,
  type SearchJobClock,
  type SearchJobProvider,
  type SearchJobPage,
  type RunSearchJobOptions,
  type RunSearchJobResult,
} from "./discovery/run-search-job";
export { normalizeWebsiteInput } from "./website-analyzer/normalize-url";
export { detectParkedOrEmpty } from "./website-analyzer/parked-page";
export { extractContacts } from "./website-analyzer/extract-contacts";
export { computeChecks } from "./website-analyzer/checks";
export { classifyOpenWebsite, type ClassifyInput, type ClassifyResult } from "./website-analyzer/classify";
export { isPathAllowed } from "./website-analyzer/robots";
export { runWebsiteAnalysis } from "./website-analyzer/run-website-analysis";
export { computeScore } from "./scoring/compute-score";
export type {
  ScoringRules,
  ScoringInput,
  ScoringContactSignals,
  ScoreReason,
  ScoreResult,
} from "./scoring/types";
export { chooseChannel } from "./routing/choose-channel";
export type {
  Channel,
  ChannelMode,
  ChannelStatus,
  RoutingChannelCandidate,
  RoutingSettings,
  RoutingHistory,
  RoutingInput,
  RoutingRejection,
  RoutingResult,
} from "./routing/types";
export {
  ANALYZER_VERSION,
  type WebsiteStatus,
  type BrokenReason,
  type WebsiteChecks,
  type ContactChannel,
  type FoundVia,
  type ExtractedContact,
  type WebsiteAnalysisResult,
  type WebsiteFetchResult,
  type WebsiteFetcherLike,
} from "./website-analyzer/types";
