import type { AIPromptRequest } from "../types";

export interface UpdateSummaryInput {
  previousSummary: string;
  newMessages: Array<{ direction: "IN" | "OUT"; body: string }>;
}

const JSON_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    requirements: { type: "array", items: { type: "string" } },
    interest_level: { type: "string", enum: ["LOW", "MEDIUM", "HIGH"] },
  },
  required: ["summary", "requirements", "interest_level"],
  additionalProperties: false,
};

/** J.2 `update_summary`: eski özet + yeni mesajlardan ≤120 kelimelik özet. */
export function buildUpdateSummaryPrompt(input: UpdateSummaryInput): AIPromptRequest {
  const system =
    "Sen bir satış konuşmasını özetleyen asistansın. Özeti en fazla 120 kelimeyle güncelle. " +
    "Yalnızca istenen JSON şemasında cevap ver.";

  const newMessagesText = input.newMessages.map((m) => `${m.direction === "IN" ? "Müşteri" : "Biz"}: ${m.body}`).join("\n");

  const context = [`Eski özet: ${input.previousSummary || "(yok)"}`, `Yeni mesajlar:\n${newMessagesText}`].join("\n");

  return {
    operation: "update_summary",
    promptVersion: 1,
    system,
    messages: [{ role: "user", content: context }],
    jsonSchema: JSON_SCHEMA,
    maxTokens: 300,
    temperature: 0.3,
  };
}
