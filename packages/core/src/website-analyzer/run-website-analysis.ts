import { parse } from "node-html-parser";
import { normalizeWebsiteInput } from "./normalize-url";
import { detectParkedOrEmpty } from "./parked-page";
import { extractContacts } from "./extract-contacts";
import { computeChecks } from "./checks";
import { classifyOpenWebsite } from "./classify";
import { isPathAllowed } from "./robots";
import {
  ANALYZER_VERSION,
  type BrokenReason,
  type ExtractedContact,
  type WebsiteAnalysisResult,
  type WebsiteFetchResult,
  type WebsiteFetcherLike,
} from "./types";

const INNER_PAGE_KEYWORDS = ["iletisim", "contact", "hakkimizda", "about", "randevu", "appointment"];
const MAX_INNER_PAGES = 3;

function classifyFetchError(message: string): BrokenReason {
  const lower = message.toLowerCase();
  if (lower.includes("dns")) return "DNS";
  if (lower.includes("timeout") || lower.includes("zaman")) return "TIMEOUT";
  if (lower.includes("ssl") || lower.includes("certificate") || lower.includes("sertifika")) return "SSL";
  return "FETCH_ERROR";
}

function findInnerPageLinks(html: string, baseUrl: string): string[] {
  const root = parse(html);
  const links = new Set<string>();

  for (const anchor of root.querySelectorAll("a")) {
    const href = anchor.getAttribute("href")?.trim();
    if (!href || href.startsWith("#") || href.startsWith("tel:") || href.startsWith("mailto:")) continue;

    let resolved: URL;
    try {
      resolved = new URL(href, baseUrl);
    } catch {
      continue;
    }

    const lowerPath = resolved.pathname.toLowerCase();
    if (INNER_PAGE_KEYWORDS.some((kw) => lowerPath.includes(kw))) {
      links.add(resolved.toString());
    }
  }

  return [...links].slice(0, MAX_INNER_PAGES);
}

function emptyChecksBase() {
  return {
    hasPhoneLink: false,
    hasEmailLink: false,
    hasWhatsappLink: false,
    hasContactForm: false,
    hasBookingWidget: false,
    hasSocialLinks: false,
  };
}

/**
 * H bölümündeki pipeline'ın orkestrasyonu: normalize → fetch → park/boş
 * tespiti → (robots izin veriyorsa) en fazla 3 iç sayfa → kontrol/iletişim
 * çıkarımı → sınıflandırma. Fetch, inject edilen `WebsiteFetcher` üzerinden
 * yapılır (gerçek implementasyon Rust `fetch_page` komutunu sarar), bu yüzden
 * testlerde `MockWebsiteFetcher` kullanılır (CLAUDE.md #6).
 */
export async function runWebsiteAnalysis(
  fetcher: WebsiteFetcherLike,
  input: { websiteUrl?: string | undefined | null; category?: string | undefined },
): Promise<WebsiteAnalysisResult> {
  const normalizedUrl = normalizeWebsiteInput(input.websiteUrl);
  if (!normalizedUrl) {
    return {
      status: "NO_WEBSITE",
      issues: [],
      checks: null,
      contacts: [],
      pagesFetched: 0,
      analyzerVersion: ANALYZER_VERSION,
    };
  }

  let mainPage: WebsiteFetchResult;
  try {
    mainPage = await fetcher.fetchPage(normalizedUrl);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      status: "BROKEN_WEBSITE",
      brokenReason: classifyFetchError(message),
      issues: [`Site açılamadı: ${message}`],
      checks: null,
      contacts: [],
      pagesFetched: 0,
      analyzerVersion: ANALYZER_VERSION,
    };
  }

  if (mainPage.httpStatus >= 400) {
    return {
      status: "BROKEN_WEBSITE",
      brokenReason: "HTTP_ERROR",
      issues: [`Site HTTP ${mainPage.httpStatus} döndürdü.`],
      checks: null,
      contacts: [],
      finalUrl: mainPage.finalUrl,
      httpStatus: mainPage.httpStatus,
      responseMs: mainPage.responseMs,
      pagesFetched: 1,
      analyzerVersion: ANALYZER_VERSION,
    };
  }

  const parkedOrEmpty = detectParkedOrEmpty(mainPage.html);
  if (parkedOrEmpty) {
    return {
      status: "BROKEN_WEBSITE",
      brokenReason: parkedOrEmpty,
      issues: [parkedOrEmpty === "PARKED" ? "Site park sayfası/hosting varsayılan sayfası gösteriyor." : "Sitede görünür içerik yok."],
      checks: null,
      contacts: [],
      finalUrl: mainPage.finalUrl,
      httpStatus: mainPage.httpStatus,
      responseMs: mainPage.responseMs,
      pagesFetched: 1,
      analyzerVersion: ANALYZER_VERSION,
    };
  }

  let pagesFetched = 1;
  const htmlPages = [mainPage.html];

  let robotsAllowsAll = true;
  try {
    const robotsUrl = new URL("/robots.txt", mainPage.finalUrl).toString();
    const robots = await fetcher.fetchPage(robotsUrl);
    if (robots.httpStatus < 400) {
      const innerLinks = findInnerPageLinks(mainPage.html, mainPage.finalUrl).filter((link) =>
        isPathAllowed(robots.html, new URL(link).pathname),
      );
      for (const link of innerLinks) {
        try {
          const inner = await fetcher.fetchPage(link);
          if (inner.httpStatus < 400) {
            htmlPages.push(inner.html);
            pagesFetched += 1;
          }
        } catch {
          // İç sayfa okunamazsa sessizce atlanır; ana sayfa analizi geçerli kalır.
        }
      }
    }
  } catch {
    robotsAllowsAll = true;
  }
  void robotsAllowsAll;

  const contacts: ExtractedContact[] = [];
  for (const html of htmlPages) {
    contacts.push(...extractContacts(html));
  }
  const dedupedContacts = [...new Map(contacts.map((c) => [`${c.channel}:${c.normalizedValue}`, c])).values()];

  const combinedFlags = htmlPages.reduce((acc, html) => {
    const partial = computeChecks({
      html,
      https: mainPage.https,
      redirectCount: mainPage.redirectCount,
      responseMs: mainPage.responseMs,
      contactsFound: dedupedContacts.length > 0,
    });
    return {
      hasPhoneLink: acc.hasPhoneLink || partial.hasPhoneLink,
      hasEmailLink: acc.hasEmailLink || partial.hasEmailLink,
      hasWhatsappLink: acc.hasWhatsappLink || partial.hasWhatsappLink,
      hasContactForm: acc.hasContactForm || partial.hasContactForm,
      hasBookingWidget: acc.hasBookingWidget || partial.hasBookingWidget,
      hasSocialLinks: acc.hasSocialLinks || partial.hasSocialLinks,
    };
  }, emptyChecksBase());

  const mainChecks = computeChecks({
    html: mainPage.html,
    https: mainPage.https,
    redirectCount: mainPage.redirectCount,
    responseMs: mainPage.responseMs,
    contactsFound: dedupedContacts.length > 0,
  });

  const checks = { ...mainChecks, ...combinedFlags };

  const classification = classifyOpenWebsite({
    checks,
    hasAnyContact: dedupedContacts.length > 0,
    category: input.category,
  });

  return {
    status: classification.status,
    issues: classification.issues,
    checks,
    contacts: dedupedContacts,
    finalUrl: mainPage.finalUrl,
    httpStatus: mainPage.httpStatus,
    responseMs: mainPage.responseMs,
    pagesFetched,
    analyzerVersion: ANALYZER_VERSION,
  };
}
