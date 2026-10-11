import type { AIPromptRequest, OutreachChannel, ServicePackageInfo } from "../types";
import { composeObservation, composeShortObservation, type FirstMessageFacts } from "./compose-first-message";

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
  /** `businesses.website_status`; verilirse gözlem cümlesi gerçek duruma göre yazılır (analiz yoksa iddia edilmez). */
  websiteStatus?: string | null | undefined;
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
 * İlk mesajın iskeleti kodda yazılır (`compose-first-message.ts`); model YALNIZCA araya girecek teklif paragrafını yazar.
 * Komut metni hedef dilde yazılır: Türkçe bir komutun içindeki tek "İngilizce yaz" cümlesini model yok sayıp
 * Türkçe yazıyordu. Paragraf kısa tutulur: yalnızca şirket + teklif + tek soru.
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
    observation: string;
    company: string;
    packages: string;
    salesRules: string;
  };
  /** Bağlamın sonunda dili bir kez daha hatırlatır (yalnızca bağlam dili hedef dilden farklıysa). */
  closing: string | null;
}

const TEXT: Record<OutreachLanguage, PromptText> = {
  tr: {
    intro:
      "Bir yazılım şirketi adına işletmelere gidecek ilk mesajın TEKLİF paragrafını yazıyorsun. Mesajın selamlaması, işletmeye " +
      "özel gözlem cümleleri ve kapanışı hazır; sen yalnızca araya girecek TEK paragrafı yaz.",
    language: "Paragrafı doğal, sade ve düzgün bir Türkçeyle yaz; kısa cümleler kur.",
    length: (isEmail) =>
      isEmail
        ? "Paragraf 2–3 kısa cümle ve en çok 45 kelime (en çok 330 karakter) olsun."
        : "Paragraf 1–2 kısa cümle ve en çok 25 kelime (en çok 200 karakter) olsun.",
    composition:
      "Sırayla: (1) 'Biz' veya 'ekibimiz' diyerek şirketin ne yaptığını, yalnızca ŞİRKET BİLGİSİ bölümündeki bilgilerle, kendi " +
      "sade cümlelerinle anlat; 'premium', 'canlı hissiyatlı', 'yeni nesil' gibi süslü ifadeleri olduğu gibi yapıştırma. " +
      "(2) ŞİRKET BİLGİSİ'ndeki teklifi bu işletmeye uyarlayarak sun. (3) Cevaplaması kolay tek bir soruyla bitir. " +
      "Hazır gözlemi tekrar etme; selamlama, imza veya konu yazma. Yüzde, oran veya istatistik yazma; % işareti kullanma.",
    guardrail:
      "Şirketi ve teklifi yalnızca ŞİRKET BİLGİSİ'nden al; orada olmayan hizmet, fiyat, süre, referans veya teklif uydurma. " +
      "Bilmediğin bir şeyi ekip arkadaşımın netleştireceğini söyle. Sayı veya sonuç vaat etme. Mesajda başka dilden tek bir " +
      "kelime bile kullanma; çeviri gibi duran veya devrik cümle yazma. Gözlemde olmayan site sorunları ekleme.",
    channel: (channel) => `Kanal: ${channel}. Yalnızca {"body": "..."} biçiminde JSON şemasında cevap ver.`,
    labels: {
      business: "İşletme",
      category: "Kategori",
      location: "Konum",
      rating: (rating, reviewCount) =>
        `Google puanı: ${rating.toLocaleString("tr-TR")}${reviewCount !== null ? ` (${reviewCount} yorum)` : ""}`,
      observation: "Hazır gözlem (tekrar etme)",
      company: "ŞİRKET BİLGİSİ",
      packages: "İlgili paketler",
      salesRules: "Satış kuralları",
    },
    closing: null,
  },
  en: {
    intro:
      "You write the OFFER paragraph of a first outreach message to a business on behalf of a software company. The greeting, " +
      "the business-specific observation and the closing are already written; you write ONLY the single paragraph that goes between them.",
    language:
      "Write the paragraph in natural, simple, fluent English with short sentences. " +
      "The context below is in Turkish: understand it, but never copy Turkish text into the paragraph.",
    length: (isEmail) =>
      isEmail
        ? "Keep it to 2–3 short sentences and at most 45 words (max 330 characters)."
        : "Keep it to 1–2 short sentences and at most 25 words (max 200 characters).",
    composition:
      "In order: (1) say who the company is and what it does using 'we' or 'our team', ONLY with facts from the COMPANY INFO " +
      "section, in your own simple sentences; do not paste buzzwords such as 'premium' or 'next-generation' as they are. " +
      "(2) Present the offer from COMPANY INFO, tailored to this business. (3) End with one easy-to-answer question. " +
      "Do not repeat the ready observation; do not write a greeting, signature or subject. Do not write percentages, " +
      "ratios or statistics; never use the % sign.",
    guardrail:
      "Take the company and its offer ONLY from COMPANY INFO; never invent services, prices, timelines, references or offers " +
      "that are not there. If something is unknown, say a teammate will clarify it. Do not promise numbers or results. " +
      "Do not use even a single word from another language; do not mention website problems that are not in the observation.",
    channel: (channel) => `Channel: ${channel}. Reply only in the requested JSON schema as {"body": "..."}.`,
    labels: {
      business: "Business",
      category: "Category",
      location: "Location",
      rating: (rating, reviewCount) =>
        `Google rating: ${rating.toLocaleString("en-US")}${reviewCount !== null ? ` (${reviewCount} reviews)` : ""}`,
      observation: "Ready observation (do not repeat)",
      company: "COMPANY INFO",
      packages: "Relevant packages",
      salesRules: "Sales rules",
    },
    closing: "Write the paragraph in English only.",
  },
};

/** İstemin kullandığı girdiyi iskelet bileşenlerinin beklediği biçime çevirir. */
export function toFacts(input: DraftFirstMessageInput): FirstMessageFacts {
  return {
    language: input.language,
    channel: input.channel,
    businessName: input.businessName,
    category: input.category,
    rating: input.rating,
    reviewCount: input.reviewCount,
    websiteIssues: input.websiteIssues,
    websiteStatus: input.websiteStatus,
  };
}

/**
 * J.2 `draft_first_message` operasyonu için context+prompt derleyicisi. Website analizi ve skor burada tekrar
 * hesaplanmaz (deterministik koddan gelir). Model yalnızca teklif paragrafını döndürür; selamlama, gözlem, konu ve
 * kapanış `assembleFirstMessage` ile eklenir. Türkçe çeviri bu çağrıda istenmez (translate-draft ayrı çağrı).
 */
export function buildDraftFirstMessagePrompt(input: DraftFirstMessageInput): AIPromptRequest {
  const text = TEXT[input.language];
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
  const facts = toFacts(input);
  const observation = isEmail ? composeObservation(facts) : composeShortObservation(facts);

  const context = [
    `${text.labels.business}: ${input.businessName}`,
    input.category ? `${text.labels.category}: ${input.category}` : null,
    location ? `${text.labels.location}: ${location}` : null,
    input.rating !== null ? text.labels.rating(input.rating, input.reviewCount) : null,
    `${text.labels.observation}: ${observation}`,
    `${text.labels.company}: ${input.companyFacts}`,
    packagesText ? `${text.labels.packages}:\n${packagesText}` : null,
    input.salesRulesSummary ? `${text.labels.salesRules}: ${input.salesRulesSummary}` : null,
    text.closing,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  return {
    operation: "draft_first_message",
    // 9: iskelet kodda, model yalnızca teklif paragrafını yazar (kalite turu, 2026-10-11).
    promptVersion: 9,
    system,
    messages: [{ role: "user", content: context }],
    jsonSchema: jsonSchema(false),
    maxTokens: 220,
    temperature: 0.4,
  };
}
