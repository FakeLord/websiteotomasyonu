import { describe, expect, it } from "vitest";
import { buildDraftFirstMessagePrompt, type DraftFirstMessageInput } from "./draft-first-message";

const base: DraftFirstMessageInput = {
  businessName: "Austin Primary Dental",
  category: "Dentist",
  district: null,
  city: "Austin",
  rating: 4.6,
  reviewCount: 120,
  websiteIssues: ["Mobil uyum etiketi yok."],
  websiteStatus: "LOW_QUALITY_WEBSITE",
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
    expect(system).toMatch(/in natural, simple, fluent English/);
    expect(system).not.toMatch(/yazıyorsun|Türkçeyle|ŞİRKET BİLGİSİ/);
  });

  it("modelden yalnızca teklif paragrafını ister; selamlama, gözlem ve kapanışın hazır olduğunu söyler", () => {
    const system = buildDraftFirstMessagePrompt(base).system;
    expect(system).toMatch(/OFFER paragraph/);
    expect(system).toMatch(/already written/);
    expect(system).toMatch(/do not write a greeting, signature or subject/i);
  });

  it("bağlamın Türkçe olduğunu ve mesaja Türkçe kopyalanmayacağını söyler; bağlamın sonunda dili tekrar eder", () => {
    expect(buildDraftFirstMessagePrompt(base).system).toMatch(/context below is in Turkish/i);
    expect(context(base).trim()).toMatch(/Write the paragraph in English only\.$/);
  });

  it("bağlam etiketleri İngilizcedir, veriler ve hazır gözlem korunur", () => {
    const text = context(base);
    expect(text).toContain("Business: Austin Primary Dental");
    expect(text).toContain("Location: Austin");
    expect(text).toContain("Google rating: 4.6 (120 reviews)");
    expect(text).toContain("Ready observation (do not repeat):");
    expect(text).toContain("Austin Primary Dental has 120 Google reviews and a 4.6-star rating");
    expect(text).toContain("COMPANY INFO:");
    expect(text).toContain("15 dakikalık görüşme ve ücretsiz örnek tasarım");
  });

  it("uydurmayı ve yüzde/istatistiği İngilizce olarak yasaklar", () => {
    const system = buildDraftFirstMessagePrompt(base).system;
    expect(system).toMatch(/ONLY from COMPANY INFO/);
    expect(system).toMatch(/never invent/i);
    expect(system).toMatch(/percentages/i);
  });

  it("süslü sözcükleri olduğu gibi yapıştırmamasını söyler", () => {
    expect(buildDraftFirstMessagePrompt(base).system).toMatch(/do not paste buzzwords/i);
    expect(buildDraftFirstMessagePrompt(tr).system).toMatch(/süslü ifadeleri olduğu gibi yapıştırma/);
  });
});

describe("buildDraftFirstMessagePrompt — Türkçe", () => {
  it("Türkçe komutla sade ve düzgün Türkçe yazmasını söyler", () => {
    const system = buildDraftFirstMessagePrompt(tr).system;
    expect(system).toMatch(/düzgün bir Türkçeyle/);
    expect(system).not.toMatch(/English/);
  });

  it("şirket bilgisini bağlama koyar ve tek kaynak olduğunu söyler", () => {
    expect(context(tr)).toContain("15 dakikalık görüşme ve ücretsiz örnek tasarım");
    const system = buildDraftFirstMessagePrompt(tr).system;
    expect(system).toMatch(/ŞİRKET BİLGİSİ/);
    expect(system).toMatch(/uydurma/);
  });

  it("tek paragraf ister: şirket, uyarlanmış teklif ve tek soru; yüzde/istatistiği yasaklar", () => {
    const system = buildDraftFirstMessagePrompt(tr).system;
    expect(system).toMatch(/TEKLİF paragrafını/);
    expect(system).toMatch(/tek bir soruyla bitir/);
    expect(system).toMatch(/yüzde/i);
    expect(system).toMatch(/istatistik/i);
  });

  it("işletme verisini bağlama koyar; puan yoksa o satırı eklemez", () => {
    const text = context(tr);
    expect(text).toContain("Austin Primary Dental");
    expect(text).toMatch(/Google puanı: 4,6 \(120 yorum\)/);
    expect(text).toContain("Hazır gözlem (tekrar etme):");
    expect(context({ ...tr, rating: null, reviewCount: null })).not.toMatch(/Google puanı/);
  });
});

describe("buildDraftFirstMessagePrompt — uzunluk, biçim, sürüm", () => {
  it("paragraf kısadır: e-posta 45 kelime / 330 karakter, DM 25 kelime / 200 karakter", () => {
    expect(buildDraftFirstMessagePrompt(tr).system).toMatch(/45 kelime \(en çok 330 karakter\)/);
    expect(buildDraftFirstMessagePrompt(base).system).toMatch(/45 words \(max 330 characters\)/);
    for (const channel of ["INSTAGRAM", "WHATSAPP", "FACEBOOK"] as const) {
      expect(buildDraftFirstMessagePrompt({ ...tr, channel }).system, channel).toMatch(/25 kelime \(en çok 200 karakter\)/);
      expect(buildDraftFirstMessagePrompt({ ...base, channel }).system, channel).toMatch(/25 words \(max 200 characters\)/);
    }
  });

  it("yalnızca body ister; çeviriyi, konuyu ve used_facts'i istemez", () => {
    for (const input of [base, tr]) {
      const req = buildDraftFirstMessagePrompt(input);
      expect(req.system).not.toContain("translation_tr");
      const schema = JSON.stringify(req.jsonSchema);
      expect(schema).toContain("body");
      expect(schema).not.toMatch(/translation_tr|used_facts|subject/);
    }
  });

  it("çıktı token sınırı tek paragrafa göredir; düşük sıcaklık dil bilgisini korur", () => {
    const req = buildDraftFirstMessagePrompt(base);
    expect(req.maxTokens).toBeLessThanOrEqual(220);
    expect(req.temperature).toBeLessThanOrEqual(0.4);
  });

  it("'sosyal medya yönetimi' gibi bir konumlandırmayı komutun kendisi dayatmaz", () => {
    for (const input of [base, tr]) {
      expect(buildDraftFirstMessagePrompt(input).system.toLowerCase()).not.toMatch(/sosyal medya|social media/);
    }
  });

  it("önbelleğin eski taslakları vermemesi için prompt sürümü 10'dur", () => {
    expect(buildDraftFirstMessagePrompt(base).promptVersion).toBe(10);
  });
});
