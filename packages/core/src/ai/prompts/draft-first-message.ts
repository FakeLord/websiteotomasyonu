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

/** Kısa mesaj daha iyi okunur ve daha hızlı üretilir: e-posta ~90, DM kanalları ~50 kelime. */
function lengthInstruction(channel: OutreachChannel): string {
  return channel === "EMAIL"
    ? "Mesaj gövdesi en fazla 90 kelime olsun."
    : "Mesaj en fazla 50 kelime olsun; kısa bir DM gibi yaz.";
}

const GUARDRAIL_INSTRUCTIONS =
  "Yalnızca BAĞLAM bölümündeki bilgileri kullan. Bilmediğin bir şey sorulursa bunu ekip " +
  "arkadaşımın netleştireceğini söyle. Fiyat, indirim, tarih, referans uydurma. Karşı taraf " +
  "istemiyorsa ısrar etme. Mesajın sonuna isim, unvan veya rol imzası ekleme; yalnızca " +
  "\"Saygılarımla\" / \"Best regards\" gibi kısa bir kapanış yaz.";

const COMPOSITION_INSTRUCTIONS =
  "Şirketin kim olduğunu ve teklifini yalnızca ŞİRKET BİLGİSİ bölümünden al; orada olmayan hizmet, " +
  "fiyat, süre, referans veya teklif uydurma. Teklifi bu işletmeye özel kur: sektörüne, sitesinin " +
  "durumuna ve Google puanına bağlan; her işletmeye aynı kalıp cümleyi yazma. Yapı: işletmeye özgü kısa " +
  "bir açılış, şirketin tek cümlelik tanıtımı, işletmeye uyarlanmış teklif ve tek net bir çağrı. Kısa tut.";

/**
 * J.2 `draft_first_message` operasyonu için context+prompt derleyicisi.
 * Website analizi ve skor burada tekrar hesaplanmaz (deterministik koddan
 * gelir); AI yalnızca bunları satış mesajına çevirir (SPEC.md → J.2).
 */
export function buildDraftFirstMessagePrompt(input: DraftFirstMessageInput): AIPromptRequest {
  const blocked = input.websiteIssues.filter(isAutomationBlockedIssue);
  const issues = input.websiteIssues.filter((issue) => !isAutomationBlockedIssue(issue)).slice(0, 3);
  const packagesText = input.relevantPackages
    .map((p) => `- ${p.name}: ${p.summary}`)
    .join("\n");

  const withSubject = input.channel === "EMAIL";

  // Çeviri bu çağrıda İSTENMEZ: çıktıyı ikiye katlıyordu; ayrı çağrıyla (translate-draft) arka planda gelir.
  const languageInstruction =
    input.language === "en"
      ? "Mesajı doğal, saygılı ve samimi bir İngilizceyle yaz."
      : "Mesajı doğal, samimi ama profesyonel bir Türkçeyle yaz.";

  const system = [
    "Bir yazılım şirketi adına işletmelere ilk mesajı yazıyorsun.",
    languageInstruction,
    lengthInstruction(input.channel),
    COMPOSITION_INSTRUCTIONS,
    GUARDRAIL_INSTRUCTIONS,
    `Kanal: ${input.channel}. Yalnızca istenen JSON şemasında cevap ver.`,
  ].join(" ");

  const location = [input.district, input.city].filter(Boolean).join(", ");
  const reputation =
    input.rating !== null
      ? `Google puanı: ${input.rating.toLocaleString("tr-TR")}${input.reviewCount !== null ? ` (${input.reviewCount} yorum)` : ""}`
      : null;

  const context = [
    `İşletme: ${input.businessName}`,
    input.category ? `Kategori: ${input.category}` : null,
    location ? `Konum: ${location}` : null,
    reputation,
    issues.length > 0
      ? `Website sorunları: ${issues.join("; ")}`
      : blocked.length > 0
        ? "Website otomatik olarak analiz edilemedi; siteyle ilgili sorun veya yorum belirtme."
        : "Website bulunamadı.",
    `ŞİRKET BİLGİSİ: ${input.companyFacts}`,
    packagesText ? `İlgili paketler:\n${packagesText}` : null,
    input.salesRulesSummary ? `Satış kuralları: ${input.salesRulesSummary}` : null,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  return {
    operation: "draft_first_message",
    promptVersion: 3,
    system,
    messages: [{ role: "user", content: context }],
    jsonSchema: jsonSchema(withSubject),
    maxTokens: 400,
    temperature: 0.6,
  };
}
