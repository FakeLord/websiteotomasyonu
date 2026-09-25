import type { AIPromptRequest } from "../types";

export interface FollowupDraftInput {
  firstMessageBody: string;
  stepNumber: number;
  businessName: string;
}

const JSON_SCHEMA = {
  type: "object",
  properties: { body: { type: "string" } },
  required: ["body"],
  additionalProperties: false,
};

/** J.2 `followup_draft`: ilk mesaj + adım no'dan kısa bir hatırlatma taslağı. */
export function buildFollowupDraftPrompt(input: FollowupDraftInput): AIPromptRequest {
  const system =
    "Sen bir dijital ajansın satış asistanısın. Daha önce yazılmış ama cevap alınmamış bir mesaja " +
    "kısa, nazik bir hatırlatma yazıyorsun. Israrcı olma. Yalnızca istenen JSON şemasında cevap ver.";

  const context = [
    `İşletme: ${input.businessName}`,
    `Bu, ${input.stepNumber}. hatırlatma mesajı.`,
    `İlk mesaj: ${input.firstMessageBody}`,
  ].join("\n");

  return {
    operation: "followup_draft",
    promptVersion: 1,
    system,
    messages: [{ role: "user", content: context }],
    jsonSchema: JSON_SCHEMA,
    maxTokens: 200,
    temperature: 0.6,
  };
}
