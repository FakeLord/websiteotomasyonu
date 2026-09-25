import type { AIPromptRequest, ServicePackageInfo } from "../types";

export interface GenerateHandoffInput {
  conversationSummary: string;
  requirements: string[];
  availablePackages: ServicePackageInfo[];
}

const JSON_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    interest: { type: "string" },
    features: { type: "array", items: { type: "string" } },
    budget: { type: "string" },
    timeline: { type: "string" },
    price_discussed: { type: "boolean" },
    open_questions: { type: "array", items: { type: "string" } },
    recommended_package_id: { type: "string" },
  },
  required: ["title", "interest", "features", "price_discussed", "open_questions"],
  additionalProperties: false,
};

/** J.2 `generate_handoff`: PROPOSAL_READY'ye geçişte insan devralma özeti. */
export function buildGenerateHandoffPrompt(input: GenerateHandoffInput): AIPromptRequest {
  const packagesText = input.availablePackages.map((p) => `[${p.id}] ${p.name}`).join("\n");

  const system =
    "Sen bir satış konuşmasını insan ekibe devretmek için özetleyen asistansın. Yalnızca istenen " +
    "JSON şemasında cevap ver, uydurma bilgi ekleme.";

  const context = [
    `Konuşma özeti: ${input.conversationSummary}`,
    `Belirlenen gereksinimler: ${input.requirements.join(", ") || "(belirtilmedi)"}`,
    packagesText ? `Mevcut paketler:\n${packagesText}` : null,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  return {
    operation: "generate_handoff",
    promptVersion: 1,
    system,
    messages: [{ role: "user", content: context }],
    jsonSchema: JSON_SCHEMA,
    maxTokens: 400,
    temperature: 0.3,
  };
}
