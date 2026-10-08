import type { AIPromptRequest, OutreachChannel, ServicePackageInfo } from "../types";
import { isAutomationBlockedIssue } from "../../website-analyzer/automation-blocked";

/** İlk mesajın yazılacağı dil. Bilerek varsayılanı yoktur: ekip her taslakta seçer. */
export type OutreachLanguage = "tr" | "en";

export const OUTREACH_LANGUAGES: readonly OutreachLanguage[] = ["tr", "en"];

export interface DraftFirstMessageInput {
  businessName: string;
  category: string | null;
  district: string | null;
  city: string | null;
  rating: number | null;
  reviewCount: number | null;
  websiteIssues: string[];
  channel: OutreachChannel;
  language: OutreachLanguage;
  /** Bilgi Bankası "Şirket" kayıtlarının metni: şirketin kim olduğu ve teklifi için TEK kaynak. */
  companyFacts: string;
  relevantPackages: ServicePackageInfo[];
  salesRulesSummary: string;
}

function jsonSchema(withSubject: boolean) {
  return {
    type: "object",
    properties: {
      ...(withSubject ? { subject: { type: "string" } } : {}),
      body: { type: "string" },
    },
    required: ["body"],
    additionalProperties: false,
  };
}

/**
 * Komut metni hedef dilde yazılır: Türkçe bir komutun içindeki tek "İngilizce yaz" cümlesini model yok sayıp
 * Türkçe yazıyordu. Uzunluk kısa ama yeterlidir (e-posta 60–80, DM 35–45 kelime): temel bilgi, tekrar yok.
 */
interface PromptText {
  intro: string;
  language: string;
  length: (isEmail: boolean) => string;
  composition: string;
  guardrail: string;
  channel: (channel: OutreachChannel) => string;
  labels: {
    business: string;
    category: string;
    location: string;
    rating: (rating: number, reviewCount: number | null) => string;
    issues: string;
    blocked: string;
    noWebsite: string;
    company: string;
    packages: string;
    salesRules: string;
  };
  /** Bağlamın sonunda dili bir kez daha hatırlatır (yalnızca bağlam dili hedef dilden farklıysa). */
  closing: string | null;
}

const TEXT: Record<OutreachLanguage, PromptText> = {
  tr: {
    intro: "Bir yazılım şirketi adına işletmelere ilk mesajı yazıyorsun.",
    language: "Mesajın tamamını (konu dahil) doğal, samimi ama profesyonel bir Türkçeyle yaz.",
    length: (isEmail) =>
      isEmail
        ? "Mesaj gövdesi 60–80 kelime (en çok 600 karakter) olsun: üç kısa paragraf."
        : "Mesaj 35–45 kelime (en çok 350 karakter) olsun; kısa bir DM gibi akıcı yaz.",
    composition:
      "Şirketin kim olduğunu ve teklifini yalnızca ŞİRKET BİLGİSİ bölümünden al; orada olmayan hizmet, fiyat, süre, " +
      "referans veya teklif uydurma. Mesajı bu işletmeye özel kur; kalıp cümle yazma. Yapı: (1) işletme verisinden " +
      "bir veya iki somut gözlem (sektörü, sitesinin durumu, Google puanı ve yorum sayısı, konumu), (2) şirketin tek " +
      "cümlelik tanıtımı ve bu işletmeye somut faydası, (3) teklif ve tek net bir çağrı. Gereksiz övgü ve tekrar yazma. " +
      "Sayı veya sonuç vaat etme. Yüzde, oran veya istatistik yazma; % işareti kullanma.",
    guardrail:
      "Yalnızca BAĞLAM bölümündeki bilgileri kullan. Bilmediğin bir şey sorulursa bunu ekip arkadaşımın " +
      "netleştireceğini söyle. Fiyat, indirim, tarih, referans uydurma. Karşı taraf istemiyorsa ısrar etme. " +
      "Mesajın sonuna isim, unvan veya rol imzası ekleme; yalnızca \"Saygılarımla\" gibi kısa bir kapanış yaz.",
    channel: (channel) => `Kanal: ${channel}. Yalnızca istenen JSON şemasında cevap ver.`,
    labels: {
      business: "İşletme",
      category: "Kategori",
      location: "Konum",
      rating: (rating, reviewCount) =>
        `Google puanı: ${rating.toLocaleString("tr-TR")}${reviewCount !== null ? ` (${reviewCount} yorum)` : ""}`,
      issues: "Website sorunları",
      blocked: "Website otomatik olarak analiz edilemedi; siteyle ilgili sorun veya yorum belirtme.",
      noWebsite: "Website bulunamadı.",
      company: "ŞİRKET BİLGİSİ",
      packages: "İlgili paketler",
      salesRules: "Satış kuralları",
    },
    closing: null,
  },
  en: {
    intro: "You write the first outreach message to a business on behalf of a software company.",
    language:
      "Write the ENTIRE message (subject and body) in natural, friendly, professional English. " +
      "The context below is in Turkish: understand it, but never copy Turkish text into the message.",
    length: (isEmail) =>
      isEmail
        ? "Keep the body to 60–80 words (max 600 characters) in three short paragraphs."
        : "Keep it to 35–45 words (max 350 characters); write it like a short, natural DM.",
    composition:
      "Take who the company is and what it offers ONLY from the COMPANY INFO section; never invent services, prices, " +
      "timelines, references or offers that are not there. Make the message specific to this business; no boilerplate. " +
      "Structure: (1) one or two concrete observations from the business data (industry, website status, Google rating " +
      "and review count, location), (2) a one-sentence introduction of the company and the concrete benefit for this " +
      "business, (3) the offer and a single clear call to action. No filler praise or repetition. Do not promise " +
      "numbers or results. Do not write percentages, ratios or statistics; never use the % sign.",
    guardrail:
      "Use only the information in the context. If something is unknown, say a teammate will clarify it. Never invent " +
      "prices, discounts, dates or references. Do not push if they are not interested. Do not add a name, title or role " +
      "signature at the end; finish with a short closing such as \"Best regards\".",
    channel: (channel) => `Channel: ${channel}. Reply only in the requested JSON schema.`,
    labels: {
      business: "Business",
      category: "Category",
      location: "Location",
      rating: (rating, reviewCount) =>
        `Google rating: ${rating.toLocaleString("en-US")}${reviewCount !== null ? ` (${reviewCount} reviews)` : ""}`,
      issues: "Website issues",
      blocked: "The website could not be analyzed automatically; do not mention any problem or opinion about the site.",
      noWebsite: "No website found.",
      company: "COMPANY INFO",
      packages: "Relevant packages",
      salesRules: "Sales rules",
    },
    closing: "Write the subject and body in English only.",
  },
};

/**
 * J.2 `draft_first_message` operasyonu için context+prompt derleyicisi.
 * Website analizi ve skor burada tekrar hesaplanmaz (deterministik koddan
 * gelir); AI yalnızca bunları satış mesajına çevirir (SPEC.md → J.2).
 * Türkçe çeviri bu çağrıda istenmez; ayrı çağrıyla (translate-draft) arka planda gelir.
 */
export function buildDraftFirstMessagePrompt(input: DraftFirstMessageInput): AIPromptRequest {
  const text = TEXT[input.language];
  const blocked = input.websiteIssues.filter(isAutomationBlockedIssue);
  const issues = input.websiteIssues.filter((issue) => !isAutomationBlockedIssue(issue)).slice(0, 3);
  const packagesText = input.relevantPackages.map((p) => `- ${p.name}: ${p.summary}`).join("\n");
  const isEmail = input.channel === "EMAIL";

  const system = [
    text.intro,
    text.language,
    text.length(isEmail),
    text.composition,
    text.guardrail,
    text.channel(input.channel),
  ].join(" ");

  const location = [input.district, input.city].filter(Boolean).join(", ");

  const context = [
    `${text.labels.business}: ${input.businessName}`,
    input.category ? `${text.labels.category}: ${input.category}` : null,
    location ? `${text.labels.location}: ${location}` : null,
    input.rating !== null ? text.labels.rating(input.rating, input.reviewCount) : null,
    issues.length > 0
      ? `${text.labels.issues}: ${issues.join("; ")}`
      : blocked.length > 0
        ? text.labels.blocked
        : text.labels.noWebsite,
    `${text.labels.company}: ${input.companyFacts}`,
    packagesText ? `${text.labels.packages}:\n${packagesText}` : null,
    input.salesRulesSummary ? `${text.labels.salesRules}: ${input.salesRulesSummary}` : null,
    text.closing,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  return {
    operation: "draft_first_message",
    promptVersion: 6,
    system,
    messages: [{ role: "user", content: context }],
    jsonSchema: jsonSchema(isEmail),
    maxTokens: 350,
    temperature: 0.6,
  };
}
