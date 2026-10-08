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
const tr: DraftFirstMessageInput = { ...base, language: "tr" };
const context = (input: DraftFirstMessageInput) => buildDraftFirstMessagePrompt(input).messages[0]?.content ?? "";

describe("buildDraftFirstMessagePrompt — İngilizce", () => {
  it("komutun kendisi İngilizcedir (Türkçe komut içindeki tek 'İngilizce yaz' cümlesini model yok sayıyordu)", () => {
    const system = buildDraftFirstMessagePrompt(base).system;
    expect(system).toMatch(/in natural, friendly, professional English/);
    expect(system).not.toMatch(/yazıyorsun|Türkçeyle|ŞİRKET BİLGİSİ/);
  });

  it("bağlamın Türkçe olduğunu ve mesaja Türkçe kopyalanmayacağını söyler; bağlamın sonunda dili tekrar eder", () => {
    expect(buildDraftFirstMessagePrompt(base).system).toMatch(/context below is in Turkish/i);
    expect(context(base).trim()).toMatch(/Write the subject and body in English only\.$/);
  });

  it("bağlam etiketleri İngilizcedir, veriler korunur", () => {
    const text = context(base);
    expect(text).toContain("Business: Austin Primary Dental");
    expect(text).toContain("Location: Austin");
    expect(text).toContain("Google rating: 4.6 (120 reviews)");
    expect(text).toContain("COMPANY INFO:");
    expect(text).toContain("15 dakikalık görüşme ve ücretsiz örnek tasarım");
  });

  it("uydurmayı, imzayı ve yüzde/istatistiği İngilizce olarak yasaklar", () => {
    const system = buildDraftFirstMessagePrompt(base).system;
    expect(system).toMatch(/ONLY from the COMPANY INFO/);
    expect(system).toMatch(/never invent/i);
    expect(system).toMatch(/signature/i);
    expect(system).toMatch(/percentages/i);
  });

  it("bot-engelli site ve sitesiz işletme durumlarını İngilizce anlatır", () => {
    expect(context({ ...base, websiteIssues: ["Site HTTP 403 döndürdü."] })).toMatch(/could not be analyzed automatically/);
    expect(context({ ...base, websiteIssues: [] })).toMatch(/No website found/);
  });
});

describe("buildDraftFirstMessagePrompt — Türkçe", () => {
  it("Türkçe komutla Türkçe yazmasını söyler", () => {
    const system = buildDraftFirstMessagePrompt(tr).system;
    expect(system).toMatch(/Türkçeyle yaz/);
    expect(system).not.toMatch(/English/);
  });

  it("şirket bilgisini bağlama koyar ve tek kaynak olduğunu söyler", () => {
    expect(context(tr)).toContain("15 dakikalık görüşme ve ücretsiz örnek tasarım");
    const system = buildDraftFirstMessagePrompt(tr).system;
    expect(system).toMatch(/ŞİRKET BİLGİSİ/);
    expect(system).toMatch(/uydurma/);
  });

  it("işletmeye özel, somut gözlemli ve somut faydalı bir mesaj ister; yüzde/istatistiği yasaklar", () => {
    const system = buildDraftFirstMessagePrompt(tr).system;
    expect(system).toMatch(/işletmeye özel/i);
    expect(system).toMatch(/bir veya iki somut gözlem/);
    expect(system).toMatch(/somut fayda/);
    expect(system).toMatch(/yüzde/i);
    expect(system).toMatch(/istatistik/i);
  });

  it("işletme verisini bağlama koyar; puan yoksa o satırı eklemez", () => {
    const text = context(tr);
    expect(text).toContain("Austin Primary Dental");
    expect(text).toMatch(/Google puanı: 4,6 \(120 yorum\)/);
    expect(context({ ...tr, rating: null, reviewCount: null })).not.toMatch(/Google puanı/);
  });
});

describe("buildDraftFirstMessagePrompt — uzunluk, biçim, sürüm", () => {
  it("kısa ama yeterli: e-posta 60–80 kelime / 600 karakter, DM 35–45 kelime / 350 karakter", () => {
    expect(buildDraftFirstMessagePrompt(tr).system).toMatch(/60–80 kelime \(en çok 600 karakter\)/);
    expect(buildDraftFirstMessagePrompt(base).system).toMatch(/60–80 words \(max 600 characters\)/);
    for (const channel of ["INSTAGRAM", "WHATSAPP", "FACEBOOK"] as const) {
      expect(buildDraftFirstMessagePrompt({ ...tr, channel }).system, channel).toMatch(/35–45 kelime \(en çok 350 karakter\)/);
      expect(buildDraftFirstMessagePrompt({ ...base, channel }).system, channel).toMatch(/35–45 words \(max 350 characters\)/);
    }
  });

  it("çeviriyi ve used_facts'i bu çağrıda İSTEMEZ (ayrı çağrı / gereksiz çıktı)", () => {
    for (const input of [base, tr]) {
      const req = buildDraftFirstMessagePrompt(input);
      expect(req.system).not.toContain("translation_tr");
      expect(JSON.stringify(req.jsonSchema)).not.toMatch(/translation_tr|used_facts/);
    }
  });

  it("çıktı token sınırı kısa mesaja göredir", () => {
    expect(buildDraftFirstMessagePrompt(base).maxTokens).toBeLessThanOrEqual(350);
  });

  it("'sosyal medya yönetimi' gibi bir konumlandırmayı komutun kendisi dayatmaz", () => {
    for (const input of [base, tr]) {
      expect(buildDraftFirstMessagePrompt(input).system.toLowerCase()).not.toMatch(/sosyal medya|social media/);
    }
  });

  it("önbelleğin eski taslakları vermemesi için prompt sürümü 8'dir", () => {
    expect(buildDraftFirstMessagePrompt(base).promptVersion).toBe(8);
  });
});
