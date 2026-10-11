import type { AIPromptRequest, OutreachChannel } from "../types";

export interface KbSnippet {
  id: string;
  title: string;
  content: string;
}

export interface DraftReplyInput {
  conversationSummary: string;
  lastMessages: Array<{ direction: "IN" | "OUT"; body: string }>;
  intent: string;
  relevantKb: KbSnippet[];
  channel: OutreachChannel;
  /** Cevabın yazılacağı dil (müşterinin son mesajının dili). Verilmezse Türkçe. */
  language?: "tr" | "en";
}

const JSON_SCHEMA = {
  type: "object",
  properties: {
    body: { type: "string" },
    used_kb_ids: { type: "array", items: { type: "string" } },
    proposes_handoff: { type: "boolean" },
    questions_for_human: { type: "array", items: { type: "string" } },
  },
  required: ["body", "used_kb_ids", "proposes_handoff", "questions_for_human"],
  additionalProperties: false,
};

const GUARDRAIL_INSTRUCTIONS =
  "Yalnızca BAĞLAM bölümündeki bilgileri kullan. Bilmediğin bir şey sorulursa bunu ekip " +
  "arkadaşımın netleştireceğini söyle ve questions_for_human'a yaz. Fiyat, indirim, tarih, " +
  "referans uydurma. Karşı taraf istemiyorsa ısrar etme.";

const STYLE_INSTRUCTIONS: Record<"tr" | "en", string> = {
  tr:
    "Cevabı doğal, sade ve düzgün bir Türkçeyle, kısa cümlelerle yaz; çeviri gibi duran veya süslü cümleler kurma, " +
    "başka dilden tek kelime kullanma. Önce müşterinin son mesajındaki soruya veya isteğe doğrudan cevap ver, sonra " +
    "tek bir somut sonraki adım öner (ör. kısa görüşme için gün ve saat sormak). En çok 60 kelime yaz. " +
    "Selamlamayı yalnızca konuşmada henüz biz yazmadıysak kullan; imza, unvan, konu satırı veya ad yazma. " +
    "Müşteri ilgisiz, meşgul veya reddedici ise kısa teşekkür et ve kapıyı açık bırak; ısrar etme.",
  en:
    "Write the reply in natural, simple, fluent English with short sentences; no flowery wording and no words from " +
    "another language. First answer the question or request in the customer's last message directly, then suggest one " +
    "concrete next step (e.g. ask for a day and time for a short call). At most 60 words. " +
    "Use a greeting only if we have not written in this conversation yet; do not write a signature, title, subject line " +
    "or name. If the customer is uninterested, busy or declining, thank them briefly and leave the door open; do not push.",
};

/** J.2 `draft_reply`: özet + son 4 mesaj + ilgili KB girdileriyle cevap taslağı. */
export function buildDraftReplyPrompt(input: DraftReplyInput): AIPromptRequest {
  const kbText = input.relevantKb.map((k) => `[${k.id}] ${k.title}: ${k.content}`).join("\n");
  const historyText = input.lastMessages
    .slice(-4)
    .map((m) => `${m.direction === "IN" ? "Müşteri" : "Biz"}: ${m.body}`)
    .join("\n");

  const system = [
    `Sen bir yazılım şirketinin satış asistanısın. Kanal: ${input.channel}. Cevap dili: ${(input.language ?? "tr") === "en" ? "English" : "Türkçe"}.`,
    STYLE_INSTRUCTIONS[input.language ?? "tr"],
    GUARDRAIL_INSTRUCTIONS,
    "Yalnızca istenen JSON şemasında cevap ver.",
  ].join(" ");

  const context = [
    `Konuşma özeti: ${input.conversationSummary}`,
    `Algılanan niyet: ${input.intent}`,
    `Son mesajlar:\n${historyText}`,
    kbText ? `İlgili bilgi bankası girdileri:\n${kbText}` : "İlgili bilgi bankası girdisi yok.",
  ].join("\n");

  return {
    operation: "draft_reply",
    promptVersion: 2,
    system,
    messages: [{ role: "user", content: context }],
    jsonSchema: JSON_SCHEMA,
    maxTokens: 400,
    temperature: 0.4,
  };
}
