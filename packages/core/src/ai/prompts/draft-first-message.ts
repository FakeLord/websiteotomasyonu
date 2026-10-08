import type { AIPromptRequest, OutreachChannel, ServicePackageInfo } from "../types";
import { isAutomationBlockedIssue } from "../../website-analyzer/automation-blocked";

export interface DraftFirstMessageInput {
  businessName: string;
  category: string | null;
  district: string | null;
  websiteIssues: string[];
  channel: OutreachChannel;
  relevantPackages: ServicePackageInfo[];
  salesRulesSummary: string;
}

const JSON_SCHEMA = {
  type: "object",
  properties: {
    subject: { type: "string" },
    body: { type: "string" },
    used_facts: { type: "array", items: { type: "string" } },
  },
  required: ["body", "used_facts"],
  additionalProperties: false,
};

const GUARDRAIL_INSTRUCTIONS =
  "Yalnızca BAĞLAM bölümündeki bilgileri kullan. Bilmediğin bir şey sorulursa bunu ekip " +
  "arkadaşımın netleştireceğini söyle. Fiyat, indirim, tarih, referans uydurma. Karşı taraf " +
  "istemiyorsa ısrar etme. Mesajın sonuna isim, unvan veya rol (ör. \"Satış Asistanı\") imzası " +
  "ekleme; yalnızca \"Saygılarımla\" gibi kısa bir kapanış yaz.";

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

  const system = [
    "Sen bir dijital ajansın satış asistanısın. Türkçe, samimi ama profesyonel bir ilk mesaj yazıyorsun.",
    GUARDRAIL_INSTRUCTIONS,
    `Kanal: ${input.channel}. Yalnızca istenen JSON şemasında cevap ver.`,
  ].join(" ");

  const context = [
    `İşletme: ${input.businessName}`,
    input.category ? `Kategori: ${input.category}` : null,
    input.district ? `İlçe: ${input.district}` : null,
    issues.length > 0
      ? `Website sorunları: ${issues.join("; ")}`
      : blocked.length > 0
        ? "Website otomatik olarak analiz edilemedi; siteyle ilgili sorun veya yorum belirtme."
        : "Website bulunamadı.",
    packagesText ? `İlgili paketler:\n${packagesText}` : null,
    input.salesRulesSummary ? `Satış kuralları: ${input.salesRulesSummary}` : null,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  return {
    operation: "draft_first_message",
    promptVersion: 1,
    system,
    messages: [{ role: "user", content: context }],
    jsonSchema: JSON_SCHEMA,
    maxTokens: 500,
    temperature: 0.6,
  };
}
