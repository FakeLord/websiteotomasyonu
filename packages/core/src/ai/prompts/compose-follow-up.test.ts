import { describe, expect, it } from "vitest";
import { detectDraftLanguage } from "../detect-language";
import { findForeignWords } from "../foreign-words";
import { validateDraft } from "../validate-draft";
import { composeFollowUp, type FollowUpFacts } from "./compose-follow-up";

const facts = (over: Partial<FollowUpFacts> = {}): FollowUpFacts => ({
  language: "tr",
  channel: "EMAIL",
  step: 1,
  totalSteps: 2,
  businessName: "Gülşen Diş Kliniği | Şişli",
  ...over,
});

describe("composeFollowUp", () => {
  it("e-postada selamlama, gövde ve kapanış; işletmenin kısa adıyla", () => {
    const body = composeFollowUp(facts());
    expect(body.split("\n\n")).toHaveLength(3);
    expect(body.startsWith("Merhaba,")).toBe(true);
    expect(body.endsWith("Saygılarımla")).toBe(true);
    expect(body).toContain("Gülşen Diş Kliniği için");
    expect(body).not.toContain("|");
  });

  it("DM'de tek blok olur, kapanış yoktur", () => {
    const body = composeFollowUp(facts({ channel: "INSTAGRAM" }));
    expect(body.startsWith("Merhaba, ")).toBe(true);
    expect(body).not.toMatch(/Saygılarımla|\n\n/);
  });

  it("aşamalar: ilk yumuşak, son hatırlatma 'tekrar yazmayacağız' der", () => {
    expect(composeFollowUp(facts({ step: 1, totalSteps: 3 }))).toMatch(/hatırlatmak istedik/);
    expect(composeFollowUp(facts({ step: 2, totalSteps: 3 }))).toMatch(/yoğunluğunuzu anlıyoruz/);
    expect(composeFollowUp(facts({ step: 3, totalSteps: 3 }))).toMatch(/tekrar yazmayacağız/);
    expect(composeFollowUp(facts({ step: 2, totalSteps: 2 }))).toMatch(/tekrar yazmayacağız/);
    expect(composeFollowUp(facts({ step: 1, totalSteps: 1 }))).toMatch(/hatırlatmak istedik/);
  });

  it("İngilizce metin doğru dilde algılanır ve Türkçe kelime sızmaz", () => {
    for (const step of [1, 2, 3]) {
      const body = composeFollowUp(facts({ language: "en", businessName: "Maple Street Dental", step, totalSteps: 3 }));
      expect(detectDraftLanguage(body)).toBe("en");
      expect(findForeignWords(body, "en", ["Maple Street Dental"])).toEqual([]);
    }
  });

  it("tüm aşama ve dillerde doğrulayıcıdan geçer (fiyat/süre/referans/yasaklı kelime yok)", () => {
    for (const language of ["tr", "en"] as const) {
      for (const channel of ["EMAIL", "WHATSAPP"] as const) {
        for (const step of [1, 2, 3]) {
          const body = composeFollowUp(facts({ language, channel, step, totalSteps: 3 }));
          const result = validateDraft({
            body,
            channel,
            packages: [],
            salesRules: { allowDiscountMention: false, forbiddenWords: ["indirim", "%", "bedava", "garanti", "discount", "guarantee"] },
            verifiedReferenceNames: [],
            recipientBusinessName: "Gülşen Diş Kliniği",
            stopRequest: false,
          });
          expect(result.reasons, `${language}/${channel}/${step}`).toEqual([]);
        }
      }
    }
  });
});
