import type { AIPromptRequest } from "../types";

export interface ClassifyReplyInput {
  lastInboundMessage: string;
  conversationSummary: string;
}

const JSON_SCHEMA = {
  type: "object",
  properties: {
    intent: {
      type: "string",
      enum: [
        "INTERESTED",
        "NOT_INTERESTED",
        "QUESTION",
        "STOP_CONTACT",
        "UNCLEAR",
        "OTHER",
        "AUTO_REPLY",
        "WRONG_CONTACT",
        "ALREADY_HAS_PROVIDER",
      ],
    },
    confidence: { type: "number" },
    requirements_delta: { type: "array", items: { type: "string" } },
    stop_request: { type: "boolean" },
    language: { type: "string" },
  },
  required: ["intent", "confidence", "requirements_delta", "stop_request", "language"],
  additionalProperties: false,
};

const STOP_KEYWORDS = [
  "yazmayın",
  "istemiyorum",
  "rahatsız etmeyin",
  "stop",
  // ADR 0019: e-posta alt bilgisindeki çıkma satırına verilen yanıtlar ve yaygın İngilizce ifadeler.
  "çıkmak istiyorum",
  "listeden çıkar",
  "bir daha yazma",
  "unsubscribe",
  "remove me",
  "do not contact",
  "don't contact",
  "do not email",
  "opt out",
  "opt-out",
];

/**
 * J.2 `classify_reply`. Kural tabanlı STOP kelime yedeği burada değil,
 * orkestrasyon katmanında `hasStopKeyword()` ile birlikte uygulanır (SPEC.md
 * → J.3: "asimetrik, durdurmak için düşük eşik").
 */
export function buildClassifyReplyPrompt(input: ClassifyReplyInput): AIPromptRequest {
  const system =
    "Sen bir satış konuşmasındaki müşteri cevabını sınıflandıran bir asistansın. Türkçe cevapları " +
    "analiz et. Niyetler: INTERESTED (ilgileniyor), NOT_INTERESTED (ilgilenmiyor), QUESTION (soru " +
    "soruyor), STOP_CONTACT (bir daha yazılmasını istemiyor), AUTO_REPLY (otomatik yanıt: izin, " +
    "\"mesajınız alındı\"), WRONG_CONTACT (yanlış kişi veya işletme), ALREADY_HAS_PROVIDER (zaten " +
    "bir ajansı/web sitesi yapan biri var), UNCLEAR (belirsiz), OTHER (diğer). " +
    "Yalnızca istenen JSON şemasında cevap ver, ek açıklama yazma.";

  const context = [
    `Konuşma özeti: ${input.conversationSummary || "(henüz özet yok)"}`,
    `Son gelen mesaj: ${input.lastInboundMessage}`,
  ].join("\n");

  return {
    operation: "classify_reply",
    promptVersion: 1,
    system,
    messages: [{ role: "user", content: context }],
    jsonSchema: JSON_SCHEMA,
    maxTokens: 250,
    temperature: 0.2,
  };
}

export function hasStopKeyword(message: string): boolean {
  const lower = message.toLowerCase();
  return STOP_KEYWORDS.some((kw) => lower.includes(kw));
}
