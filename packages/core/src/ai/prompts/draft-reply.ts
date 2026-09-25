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

/** J.2 `draft_reply`: özet + son 4 mesaj + ilgili KB girdileriyle cevap taslağı. */
export function buildDraftReplyPrompt(input: DraftReplyInput): AIPromptRequest {
  const kbText = input.relevantKb.map((k) => `[${k.id}] ${k.title}: ${k.content}`).join("\n");
  const historyText = input.lastMessages
    .slice(-4)
    .map((m) => `${m.direction === "IN" ? "Müşteri" : "Biz"}: ${m.body}`)
    .join("\n");

  const system = [
    `Sen bir dijital ajansın satış asistanısın. Kanal: ${input.channel}.`,
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
    promptVersion: 1,
    system,
    messages: [{ role: "user", content: context }],
    jsonSchema: JSON_SCHEMA,
    maxTokens: 500,
    temperature: 0.6,
  };
}
