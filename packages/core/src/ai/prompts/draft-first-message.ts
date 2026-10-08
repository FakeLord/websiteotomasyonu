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

function jsonSchema(translated: boolean, withSubject: boolean) {
  return {
    type: "object",
    properties: {
      subject: { type: "string" },
      ...(translated && withSubject ? { subject_tr: { type: "string" } } : {}),
      body: { type: "string" },
      ...(translated ? { translation_tr: { type: "string" } } : {}),
      used_facts: { type: "array", items: { type: "string" } },
    },
    required: translated ? ["body", "translation_tr", "used_facts"] : ["body", "used_facts"],
    additionalProperties: false,
  };
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

  const translated = input.language !== "tr";
  const withSubject = input.channel === "EMAIL";

  const languageInstruction = translated
    ? `Mesajı doğal, saygılı ve samimi bir İngilizceyle yaz. Ekip Türkçe okuduğu için translation_tr alanına mesajın tam Türkçe çevirisini yaz${
        withSubject ? "; konunun Türkçesini subject_tr alanına yaz" : ""
      }.`
    : "Mesajı doğal, samimi ama profesyonel bir Türkçeyle yaz.";

  const system = [
    "Bir yazılım şirketi adına işletmelere ilk mesajı yazıyorsun.",
    languageInstruction,
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
    promptVersion: 2,
    system,
    messages: [{ role: "user", content: context }],
    jsonSchema: jsonSchema(translated, withSubject),
    maxTokens: translated ? 900 : 500,
    temperature: 0.6,
  };
}
