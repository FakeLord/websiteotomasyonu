import type { OutreachChannel } from "../types";
import { isAutomationBlockedIssue } from "../../website-analyzer/automation-blocked";
import type { OutreachLanguage } from "./draft-first-message";

/**
 * İlk mesajın iskeleti (selamlama, işletmeye özel gözlem, konu, kapanış) KOD tarafından yazılır; yapay zekâ yalnızca araya
 * giren teklif paragrafını yazar. Sebep: küçük ücretsiz model baştan sona serbest yazınca Türkçe dil bilgisi hataları,
 * yanlış özneler ("sitelerimiz erişilemiyor") ve alakasız konu satırları üretiyordu. Gözlem cümleleri deterministik ve
 * elle yazılmıştır; yalnızca işletme verisinden (puan, yorum, site durumu) beslenir, hiçbir iddiayı uydurmaz.
 */

export interface FirstMessageFacts {
  language: OutreachLanguage;
  channel: OutreachChannel;
  businessName: string;
  category: string | null;
  rating: number | null;
  reviewCount: number | null;
  websiteIssues: string[];
  /** `businesses.website_status`; verilmezse durum `websiteIssues`'dan çıkarılır. */
  websiteStatus?: string | null | undefined;
}

export type SiteKind = "NONE" | "BROKEN" | "WEAK" | "UNKNOWN";

interface IssuePattern {
  test: RegExp;
  tr: string;
  en: string;
}

// Site analizinin ürettiği sorun metinleri → okunur cümle parçaları (analiz Türkçe ve ekip içindir).
const ISSUE_PATTERNS: IssuePattern[] = [
  { test: /HTTPS kullanm[ıi]yor|güvensiz \(http/i, tr: "güvenli bağlantının (HTTPS) bulunmaması", en: "it does not use a secure HTTPS connection" },
  { test: /Mobil uyum|mobilde düzgün/i, tr: "mobil cihazlarda düzgün görünmemesi", en: "it does not display properly on mobile devices" },
  {
    test: /telefon, e-posta|iletişim formu/i,
    tr: "ziyaretçilerin size kolayca ulaşabileceği bir iletişim formunun bulunmaması",
    en: "there is no easy way for visitors to contact you",
  },
  { test: /Randevu sistemi|online randevu/i, tr: "online randevu alınabilecek bir yapının bulunmaması", en: "there is no way to book an appointment online" },
  { test: /Sayfa başlığı|SEO/i, tr: "sayfa başlığı ve açıklamasının eksik olması", en: "the page title and description are missing" },
  { test: /yanıt süresi|yavaş yükleni/i, tr: "sayfaların geç açılması", en: "pages load slowly" },
  { test: /eski görünüyor/i, tr: "görsel olarak eskimiş görünmesi", en: "it looks outdated" },
];

const BROKEN_PATTERN = /açılam|açılm[ıi]yor|park sayfası|görünür içerik yok|Site HTTP \d{3}|bağlantı hatası|zaman aşımı/i;

function fnv(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

/** Aynı işletme her seferinde aynı çeşidi alır; farklı işletmeler farklı çeşitleri (toplu taslaklar birbirine benzemesin). */
function pick<T>(variants: readonly T[], seed: string): T {
  return variants[fnv(seed) % variants.length] as T;
}

/** Sektörden "arayan kişi" adı: yalnızca açık eşleşmelerde özel sözcük, aksi halde genel "müşteri". */
function audience(category: string | null, language: OutreachLanguage): string {
  const c = (category ?? "").toLocaleLowerCase("tr-TR");
  const health = /diş|dent|klinik|clinic|veteriner|vet|fizyo|physio|psikolog|psycholog|doktor|doctor|terapi|therap|eczane|pharmac/.test(c);
  const food = /restoran|restaurant|kafe|cafe|café|pastane|bakery|bistro|otel|hotel|lokanta|pizz/.test(c);
  if (language === "tr") return health ? "hastalar" : food ? "misafirler" : "müşteriler";
  return health ? "patients" : food ? "guests" : "customers";
}

export function classifySite(facts: Pick<FirstMessageFacts, "websiteIssues" | "websiteStatus">): { kind: SiteKind; issues: string[] } {
  const issues = facts.websiteIssues.filter((issue) => !isAutomationBlockedIssue(issue));
  const blocked = facts.websiteIssues.length > issues.length;
  const status = facts.websiteStatus;

  if (status !== undefined) {
    if (status === "NO_WEBSITE") return { kind: "NONE", issues };
    if (status === "BROKEN_WEBSITE") return { kind: "BROKEN", issues };
    if (status === "LOW_QUALITY_WEBSITE") return { kind: "WEAK", issues };
    return { kind: "UNKNOWN", issues };
  }
  if (blocked && issues.length === 0) return { kind: "UNKNOWN", issues };
  if (issues.length === 0) return { kind: "NONE", issues };
  if (issues.some((issue) => BROKEN_PATTERN.test(issue))) return { kind: "BROKEN", issues };
  return { kind: "WEAK", issues };
}

function issuePhrases(issues: string[], language: OutreachLanguage): string[] {
  const phrases: string[] = [];
  for (const pattern of ISSUE_PATTERNS) {
    if (issues.some((issue) => pattern.test.test(issue))) phrases.push(pattern[language]);
    if (phrases.length === 2) break;
  }
  if (phrases.length === 0 && issues.length > 0) {
    phrases.push(language === "tr" ? "bazı teknik eksikler bulunması" : "there are some technical issues");
  }
  return phrases;
}

function joinPhrases(phrases: string[], language: OutreachLanguage): string {
  if (phrases.length <= 1) return phrases[0] ?? "";
  return language === "tr" ? `${phrases[0]} ve ${phrases[1]}` : `${phrases[0]} and ${phrases[1]}`;
}

const formatRating = (rating: number, language: OutreachLanguage) =>
  rating.toLocaleString(language === "tr" ? "tr-TR" : "en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

type Reputation = "STRONG" | "FACT" | "NONE";

/** Güçlü övgü yalnızca gerçekten yüksek puanda; orta puanda yalnızca olgu; düşük puan veya az yorumda hiç anılmaz. */
function reputationOf(facts: FirstMessageFacts): Reputation {
  if (facts.rating === null || facts.reviewCount === null || facts.reviewCount < 10) return "NONE";
  if (facts.rating >= 4.5) return "STRONG";
  if (facts.rating >= 4) return "FACT";
  return "NONE";
}

/** İşletmeye özel gözlem paragrafı (e-posta). */
export function composeObservation(facts: FirstMessageFacts): string {
  const { kind, issues } = classifySite(facts);
  const name = facts.businessName;
  const aud = audience(facts.category, facts.language);
  const seed = `${name}|${kind}`;
  const rep = reputationOf(facts);
  const r = facts.rating !== null ? formatRating(facts.rating, facts.language) : "";
  const n = facts.reviewCount ?? 0;

  if (facts.language === "tr") {
    const lead =
      rep === "STRONG"
        ? pick(
            [
              `${name}, Google'da ${r} puan ve ${n} yorumla öne çıkıyor.`,
              `${name} için Google'da ${n} yorum ve ${r} puan görüyoruz; bu gerçekten güçlü bir itibar.`,
            ],
            seed,
          )
        : rep === "FACT"
          ? `${name} için Google'da ${n} yorum ve ${r} puan görüyoruz.`
          : `${name} için Google kaydını inceledik.`;
    if (kind === "NONE") {
      return `${lead} Ancak işletmenizin kendi web sitesi bulunmuyor; sizi internette arayan ${aud} güvenle bakabilecekleri bir sayfa bulamıyor.`;
    }
    if (kind === "BROKEN") {
      return `${lead} Ancak web sitenize girmeye çalıştığımızda sayfa açılmadı; siteyi ziyaret eden ${aud} boş bir sayfayla karşılaşıyor olabilir.`;
    }
    if (kind === "WEAK") {
      const phrases = joinPhrases(issuePhrases(issues, "tr"), "tr");
      return `${lead} Web sitenizi incelediğimizde ${phrases} dikkatimizi çekti; bu eksikler, sizi araştıranların müşteriye dönüşmesini zorlaştırabilir.`;
    }
    return rep === "STRONG"
      ? `${lead} Dijital görünürlüğünüzü bu güçlü itibarın üzerine birlikte kurabileceğimizi düşünüyoruz.`
      : `${lead} İşletmenizin internetteki görünürlüğünü birlikte güçlendirebileceğimizi düşünüyoruz.`;
  }

  const lead =
    rep === "STRONG"
      ? pick(
          [
            `${name} stands out on Google with ${r} stars from ${n} reviews.`,
            `${name} has ${n} Google reviews and a ${r}-star rating, which is a genuinely strong reputation.`,
          ],
          seed,
        )
      : rep === "FACT"
        ? `${name} has ${n} Google reviews and a ${r}-star rating.`
        : `We took a look at the Google listing for ${name}.`;
  if (kind === "NONE") {
    return `${lead} However, you do not have a website of your own yet, so ${aud} searching for you online have no page they can trust and browse.`;
  }
  if (kind === "BROKEN") {
    return `${lead} However, when we tried to open your website the page would not load, so ${aud} visiting the site may land on an empty page.`;
  }
  if (kind === "WEAK") {
    const list = joinPhrases(issuePhrases(issues, "en"), "en");
    return `${lead} When we looked at your website, we noticed that ${list}. That can make it harder for people who find you to become customers.`;
  }
  return rep === "STRONG"
    ? `${lead} We think your online presence can be built on top of that strong reputation.`
    : `${lead} We think we can help strengthen your online presence together.`;
}

/** DM için tek cümlelik kısa gözlem. */
export function composeShortObservation(facts: FirstMessageFacts): string {
  const { kind, issues } = classifySite(facts);
  const name = facts.businessName;
  const tr = facts.language === "tr";
  if (kind === "NONE") {
    return tr ? `${name} için Google'da iyi yorumlar görüyoruz ancak web siteniz yok.` : `${name} has great Google reviews but no website.`;
  }
  if (kind === "BROKEN") {
    return tr ? `${name} web siteniz şu anda açılmıyor.` : `${name}'s website does not seem to load right now.`;
  }
  if (kind === "WEAK") {
    const first = issuePhrases(issues, facts.language)[0] ?? "";
    return tr ? `${name} web sitenizi incelerken ${first} dikkatimizi çekti.` : `Looking at ${name}'s website, we noticed that ${first}.`;
  }
  return tr ? `${name} için internetteki görünürlüğünüzü birlikte güçlendirebiliriz.` : `We think we can help ${name} get more from its online presence.`;
}

export function composeSubject(facts: FirstMessageFacts): string {
  const { kind } = classifySite(facts);
  const name = facts.businessName;
  if (facts.language === "tr") {
    if (kind === "NONE" || kind === "BROKEN") return `${name} için web sitesi önerisi`;
    if (kind === "WEAK") return `${name} web sitesi hakkında kısa bir öneri`;
    return `${name} için kısa bir öneri`;
  }
  if (kind === "NONE" || kind === "BROKEN") return `A website idea for ${name}`;
  if (kind === "WEAK") return `A few thoughts on the ${name} website`;
  return `A quick idea for ${name}`;
}

/** Modelin teklif paragrafından olası selamlama/imza/boşluk fazlalıklarını ayıklar. */
export function cleanOffer(raw: string): string {
  const lines = raw
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => !/^(merhaba|merhabalar|selam|sayın|hello|hi|dear)\b[^.!?]*[,!:]?$/i.test(line))
    .filter((line) => !/^(saygılarımla|saygılar|iyi günler|best regards|kind regards|regards|sincerely)[,.!]?$/i.test(line));
  return lines.join(" ").replace(/\s{2,}/g, " ").trim();
}

/** Selamlama + gözlem + (modelin) teklif paragrafı + kapanış. DM'de selamlama kısa, kapanış yoktur. */
export function assembleFirstMessage(facts: FirstMessageFacts, offer: string): { subject: string; body: string } {
  const cleaned = cleanOffer(offer);
  const tr = facts.language === "tr";
  const subject = composeSubject(facts);
  if (facts.channel === "EMAIL") {
    const greeting = tr ? "Merhaba," : "Hello,";
    const closing = tr ? "Saygılarımla" : "Best regards";
    const parts = [greeting, composeObservation(facts), cleaned, closing].filter((part) => part.length > 0);
    return { subject, body: parts.join("\n\n") };
  }
  const greeting = tr ? "Merhaba," : "Hello,";
  return { subject, body: [`${greeting} ${composeShortObservation(facts)}`, cleaned].filter((p) => p.length > 0).join("\n\n") };
}
