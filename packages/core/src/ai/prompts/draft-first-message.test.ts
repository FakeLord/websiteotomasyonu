import { describe, expect, it } from "vitest";
import { buildDraftFirstMessagePrompt, type DraftFirstMessageInput } from "./draft-first-message";

const base: DraftFirstMessageInput = {
  businessName: "Austin Primary Dental",
  category: "Dentist",
  district: null,
  city: "Austin",
  rating: 4.6,
  reviewCount: 120,
  websiteIssues: ["Site mobilde düzgün görünmüyor."],
  channel: "EMAIL",
  language: "en",
  companyFacts:
    "Biz bir yazılım şirketiyiz: premium, canlı hissiyatlı web siteleri, mobil uygulama ve otomasyon. Teklif: 15 dakikalık görüşme ve ücretsiz örnek tasarım.",
  relevantPackages: [],
  salesRulesSummary: "",
};

describe("buildDraftFirstMessagePrompt — dil ve şirket kimliği", () => {
  it("İngilizce istenince modele İngilizce yazmasını ve Türkçe çeviriyi translation_tr'ye koymasını söyler", () => {
    const req = buildDraftFirstMessagePrompt(base);
    expect(req.system).toMatch(/İngilizce/);
    expect(req.system).toContain("translation_tr");
    expect(req.system).toContain("subject_tr");
    expect(JSON.stringify(req.jsonSchema)).toContain("translation_tr");
  });

  it("e-posta dışındaki kanalda konu çevirisi istenmez", () => {
    const req = buildDraftFirstMessagePrompt({ ...base, channel: "INSTAGRAM" });
    expect(req.system).not.toContain("subject_tr");
  });

  it("Türkçe istenince çeviri istenmez", () => {
    const req = buildDraftFirstMessagePrompt({ ...base, language: "tr" });
    expect(req.system).toMatch(/Türkçe/);
    expect(req.system).not.toContain("translation_tr");
  });

  it("şirket bilgisini bağlama koyar ve tek kaynak olduğunu söyler", () => {
    const req = buildDraftFirstMessagePrompt(base);
    expect(req.messages[0]?.content).toContain("15 dakikalık görüşme ve ücretsiz örnek tasarım");
    expect(req.system).toMatch(/ŞİRKET BİLGİSİ/);
    expect(req.system).toMatch(/uydurma/);
  });

  it("teklifin işletmeye özel kurulmasını ister ve işletme verisini bağlama koyar", () => {
    const req = buildDraftFirstMessagePrompt(base);
    expect(req.system).toMatch(/işletmeye özel/i);
    const context = req.messages[0]?.content ?? "";
    expect(context).toContain("Austin Primary Dental");
    expect(context).toContain("Austin");
    expect(context).toMatch(/4[.,]6/);
    expect(context).toContain("120");
  });

  it("puan veya yorum yoksa bu satırı eklemez", () => {
    const req = buildDraftFirstMessagePrompt({ ...base, rating: null, reviewCount: null });
    expect(req.messages[0]?.content).not.toMatch(/Google puanı/);
  });

  it("'sosyal medya yönetimi' gibi bir konumlandırmayı komutun kendisi dayatmaz", () => {
    const req = buildDraftFirstMessagePrompt(base);
    expect(req.system.toLowerCase()).not.toContain("sosyal medya");
  });

  it("önbelleğin eski taslakları vermemesi için prompt sürümü 2'dir", () => {
    expect(buildDraftFirstMessagePrompt(base).promptVersion).toBe(2);
  });
});
