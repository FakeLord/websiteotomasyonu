export type WebsiteStatus = "NO_WEBSITE" | "BROKEN_WEBSITE" | "LOW_QUALITY_WEBSITE" | "GOOD_WEBSITE";

export type BrokenReason = "DNS" | "TIMEOUT" | "HTTP_ERROR" | "SSL" | "PARKED" | "EMPTY" | "FETCH_ERROR";

export interface WebsiteChecks {
  https: boolean;
  redirectProblem: boolean;
  responsive: boolean;
  hasPhoneLink: boolean;
  hasEmailLink: boolean;
  hasWhatsappLink: boolean;
  hasContactForm: boolean;
  hasBookingWidget: boolean;
  hasSocialLinks: boolean;
  hasMetaTitle: boolean;
  hasMetaDescription: boolean;
  slowResponse: boolean;
  staleSignals: boolean;
  mixedContent: boolean;
  jsRendered: boolean;
}

export type ContactChannel = "PHONE" | "EMAIL" | "WHATSAPP" | "INSTAGRAM" | "FACEBOOK" | "LINKEDIN" | "TIKTOK";
export type FoundVia = "WEBSITE" | "JSON_LD";

export interface ExtractedContact {
  channel: ContactChannel;
  value: string;
  normalizedValue: string;
  foundVia: FoundVia;
  confidence: number;
}

export interface WebsiteAnalysisResult {
  status: WebsiteStatus;
  brokenReason?: BrokenReason;
  issues: string[];
  checks: WebsiteChecks | null;
  contacts: ExtractedContact[];
  finalUrl?: string;
  httpStatus?: number;
  responseMs?: number;
  pagesFetched: number;
  analyzerVersion: number;
}

export const ANALYZER_VERSION = 1;

/**
 * `runSearchJob`'daki `SearchJobProvider` deseniyle aynı sebeple (bkz.
 * discovery/run-search-job.ts) burada da `packages/providers`'a bağımlı
 * olmayan, yerel bir fetch sözleşmesi tanımlanır. Gerçek implementasyon
 * (Rust `fetch_page` komutu) `packages/providers`'daki `WebsiteFetcher` ile
 * aynı şekle sahiptir; masaüstü adapter'ı ikisini birbirine bağlar.
 */
export interface WebsiteFetchResult {
  finalUrl: string;
  httpStatus: number;
  redirectCount: number;
  responseMs: number;
  https: boolean;
  html: string;
}

export interface WebsiteFetcherLike {
  fetchPage(url: string): Promise<WebsiteFetchResult>;
}
