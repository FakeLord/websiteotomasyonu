import type { AIPromptRequest, OutreachChannel } from "../types";

export interface TranslateDraftInput {
  subject?: string | undefined;
  body: string;
  channel: OutreachChannel;
  /** Çevrilecek dil; verilmezse Türkçe. Çıktı alanları (`translation_tr`, `subject_tr`) hedef dildeki çeviriyi taşır. */
  targetLanguage?: "tr" | "en";
}

/**
 * Taslağın Türkçe çevirisi. Ana taslak çağrısından AYRIDIR: çeviri çıktının yarısını oluşturuyordu ve
 * taslağın görünmesini geciktiriyordu. Çeviri yalnızca ekibin okuması içindir; gönderilmez, bu yüzden
 * satış guardrail'larından geçirilmez.
 */
export function buildTranslateDraftPrompt(input: TranslateDraftInput): AIPromptRequest {
  const withSubject = input.channel === "EMAIL" && !!input.subject;

  const toEnglish = input.targetLanguage === "en";
  const system = (
    toEnglish
      ? [
          "Translate the following sales message into natural, simple, fluent English, keeping its meaning.",
          "Do not add information, do not remove anything, do not comment; give only the translation.",
          `Write the translation into the translation_tr field${withSubject ? " and the translated subject into the subject_tr field" : ""} (the field names are fixed; they hold the English text).`,
          "Reply only in the requested JSON schema.",
        ]
      : [
          "Aşağıdaki satış mesajını anlamını koruyarak doğal Türkçeye çevir.",
          "Yeni bilgi ekleme, hiçbir şeyi çıkarma, yorum yapma; yalnızca çeviriyi ver.",
          `Çeviriyi translation_tr alanına yaz${withSubject ? "; konunun çevirisini subject_tr alanına yaz" : ""}.`,
          "Yalnızca istenen JSON şemasında cevap ver.",
        ]
  ).join(" ");

  const content = [withSubject ? `Konu: ${input.subject}` : null, `Mesaj:\n${input.body}`]
    .filter((line): line is string => line !== null)
    .join("\n\n");

  return {
    operation: "translate_draft",
    promptVersion: toEnglish ? 2 : 1,
    system,
    messages: [{ role: "user", content }],
    jsonSchema: {
      type: "object",
      properties: {
        ...(withSubject ? { subject_tr: { type: "string" } } : {}),
        translation_tr: { type: "string" },
      },
      required: ["translation_tr"],
      additionalProperties: false,
    },
    maxTokens: 600,
    temperature: 0.2,
  };
}
