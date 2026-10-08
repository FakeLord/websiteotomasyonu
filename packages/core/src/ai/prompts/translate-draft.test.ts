import { describe, expect, it } from "vitest";
import { buildTranslateDraftPrompt } from "./translate-draft";

describe("buildTranslateDraftPrompt", () => {
  const base = { subject: "A fresh look for your website", body: "Hello team,\n\nWe build modern websites.", channel: "EMAIL" as const };

  it("mesajı olduğu gibi çevirmesini ister, yeni bilgi eklemesini yasaklar", () => {
    const req = buildTranslateDraftPrompt(base);
    expect(req.operation).toBe("translate_draft");
    expect(req.system).toMatch(/Türkçe/);
    expect(req.system).toMatch(/ekleme|çıkarma/);
    expect(req.messages[0]?.content).toContain("We build modern websites.");
  });

  it("e-postada konuyu da çevirtir (subject_tr), DM'de istemez", () => {
    const email = buildTranslateDraftPrompt(base);
    expect(email.messages[0]?.content).toContain("A fresh look for your website");
    expect(JSON.stringify(email.jsonSchema)).toContain("subject_tr");

    const dm = buildTranslateDraftPrompt({ ...base, channel: "INSTAGRAM", subject: undefined });
    expect(JSON.stringify(dm.jsonSchema)).not.toContain("subject_tr");
  });

  it("deterministik ve kısadır (düşük sıcaklık)", () => {
    const req = buildTranslateDraftPrompt(base);
    expect(req.temperature).toBeLessThanOrEqual(0.3);
    expect(req.maxTokens).toBeLessThanOrEqual(700);
  });
});
