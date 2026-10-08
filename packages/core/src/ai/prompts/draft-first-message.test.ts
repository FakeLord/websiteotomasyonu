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
  it("İngilizce istenince modele İngilizce yazmasını söyler", () => {
    const req = buildDraftFirstMessagePrompt(base);
    expect(req.system).toMatch(/İngilizce/);
  });

  it("çeviriyi bu çağrıda İSTEMEZ: çeviri ayrı, arka plan çağrısıdır (süre yarıya iner)", () => {
    for (const language of ["en", "tr"] as const) {
      const req = buildDraftFirstMessagePrompt({ ...base, language });
      expect(req.system).not.toContain("translation_tr");
      expect(req.system).not.toContain("subject_tr");
      expect(JSON.stringify(req.jsonSchema)).not.toContain("translation_tr");
    }
  });

  it("kullanılmayan used_facts alanını istemez (gereksiz çıktı)", () => {
    const req = buildDraftFirstMessagePrompt(base);
    expect(JSON.stringify(req.jsonSchema)).not.toContain("used_facts");
    expect(req.system).not.toContain("used_facts");
  });

  it("Türkçe istenince Türkçe yazmasını söyler", () => {
    const req = buildDraftFirstMessagePrompt({ ...base, language: "tr" });
    expect(req.system).toMatch(/Türkçe/);
  });

  it("e-posta için 160 kelime/1100 karakter, DM kanalları için 80 kelime/550 karakter sınırı koyar (kanal karakter sınırlarının altında)", () => {
    expect(buildDraftFirstMessagePrompt({ ...base, channel: "EMAIL" }).system).toMatch(/160 kelime \(en çok 1100 karakter\)/);
    for (const channel of ["INSTAGRAM", "WHATSAPP", "FACEBOOK"] as const) {
      expect(buildDraftFirstMessagePrompt({ ...base, channel }).system, channel).toMatch(/80 kelime \(en çok 550 karakter\)/);
    }
  });

  it("işletme verisinden somut gözlemler ve şirketin hizmetlerinden somut fayda ister, uydurmayı yasaklar", () => {
    const system = buildDraftFirstMessagePrompt(base).system;
    expect(system).toMatch(/en az iki somut gözlem/);
    expect(system).toMatch(/somut fayda|somut olarak/);
    expect(system).toMatch(/uydurma/);
  });

  it("yüzde ve istatistik yazmayı açıkça yasaklar (% işareti güvenlik kontrolünde yasaklı ifadedir)", () => {
    const system = buildDraftFirstMessagePrompt(base).system;
    expect(system).toMatch(/yüzde/i);
    expect(system).toMatch(/istatistik/i);
  });

  it("çıktı token sınırı makuldür (çeviri artık aynı çağrıda değil)", () => {
    expect(buildDraftFirstMessagePrompt(base).maxTokens).toBeLessThanOrEqual(600);
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

  it("önbelleğin eski taslakları vermemesi için prompt sürümü 5'tir", () => {
    expect(buildDraftFirstMessagePrompt(base).promptVersion).toBe(5);
  });
});
