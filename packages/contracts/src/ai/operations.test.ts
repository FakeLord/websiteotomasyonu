import { describe, expect, it } from "vitest";
import {
  classifyReplyOutputSchema,
  draftFirstMessageOutputSchema,
  draftReplyOutputSchema,
  followupDraftOutputSchema,
  generateHandoffOutputSchema,
  translateDraftOutputSchema,
  updateSummaryOutputSchema,
} from "./operations";

describe("draftFirstMessageOutputSchema", () => {
  it("accepts a valid draft", () => {
    const result = draftFirstMessageOutputSchema.parse({
      body: "Merhaba, işletmenizin web sitesini inceledik...",
      used_facts: ["NO_WEBSITE"],
    });
    expect(result.subject).toBeUndefined();
  });

  it("rejects an empty body", () => {
    expect(() => draftFirstMessageOutputSchema.parse({ body: "", used_facts: [] })).toThrow();
  });

  it("does not require used_facts (the model is no longer asked for it)", () => {
    const result = draftFirstMessageOutputSchema.parse({ body: "Merhaba" });
    expect(result.body).toBe("Merhaba");
  });
});

describe("translateDraftOutputSchema", () => {
  it("accepts a Turkish translation with an optional subject", () => {
    const result = translateDraftOutputSchema.parse({ translation_tr: "Merhaba ekip...", subject_tr: "Yeni bir görünüm" });
    expect(result.subject_tr).toBe("Yeni bir görünüm");
    expect(translateDraftOutputSchema.parse({ translation_tr: "Merhaba" }).subject_tr).toBeUndefined();
  });

  it("rejects an empty translation", () => {
    expect(() => translateDraftOutputSchema.parse({ translation_tr: "" })).toThrow();
  });
});

describe("classifyReplyOutputSchema", () => {
  it("accepts a valid classification", () => {
    const result = classifyReplyOutputSchema.parse({
      intent: "STOP_CONTACT",
      confidence: 0.9,
      requirements_delta: [],
      stop_request: true,
      language: "tr",
    });
    expect(result.intent).toBe("STOP_CONTACT");
  });

  it("rejects confidence outside 0-1", () => {
    expect(() =>
      classifyReplyOutputSchema.parse({
        intent: "OTHER",
        confidence: 1.5,
        requirements_delta: [],
        stop_request: false,
        language: "tr",
      }),
    ).toThrow();
  });

  it.each(["AUTO_REPLY", "WRONG_CONTACT", "ALREADY_HAS_PROVIDER"])("accepts the SPEC → L intent %s", (intent) => {
    const result = classifyReplyOutputSchema.parse({
      intent,
      confidence: 0.8,
      requirements_delta: [],
      stop_request: false,
      language: "tr",
    });
    expect(result.intent).toBe(intent);
  });

  it("rejects an unknown intent value", () => {
    expect(() =>
      classifyReplyOutputSchema.parse({
        intent: "MAYBE",
        confidence: 0.5,
        requirements_delta: [],
        stop_request: false,
        language: "tr",
      }),
    ).toThrow();
  });
});

describe("draftReplyOutputSchema", () => {
  it("accepts a valid reply", () => {
    const result = draftReplyOutputSchema.parse({
      body: "Elbette, size yardımcı olabilirim.",
      used_kb_ids: ["kb-1"],
      proposes_handoff: false,
      questions_for_human: [],
    });
    expect(result.proposes_handoff).toBe(false);
  });
});

describe("updateSummaryOutputSchema", () => {
  it("accepts a valid summary", () => {
    const result = updateSummaryOutputSchema.parse({
      summary: "Müşteri fiyat sordu.",
      requirements: ["logo tasarımı"],
      interest_level: "HIGH",
    });
    expect(result.interest_level).toBe("HIGH");
  });

  it("rejects an invalid interest_level", () => {
    expect(() =>
      updateSummaryOutputSchema.parse({ summary: "x", requirements: [], interest_level: "VERY_HIGH" }),
    ).toThrow();
  });
});

describe("generateHandoffOutputSchema", () => {
  it("accepts a valid handoff without optional fields", () => {
    const result = generateHandoffOutputSchema.parse({
      title: "ABC Diş Kliniği - Website Yenileme",
      interest: "Yüksek",
      features: ["responsive tasarım"],
      price_discussed: false,
      open_questions: [],
    });
    expect(result.budget).toBeUndefined();
  });
});

describe("followupDraftOutputSchema", () => {
  it("accepts a minimal follow-up body", () => {
    expect(followupDraftOutputSchema.parse({ body: "Merhaba, tekrar yazmak istedim." }).body).toBeTruthy();
  });
});
