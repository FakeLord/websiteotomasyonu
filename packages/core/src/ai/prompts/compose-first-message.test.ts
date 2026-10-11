import { describe, expect, it } from "vitest";
import { detectDraftLanguage } from "../detect-language";
import { findForeignWords } from "../foreign-words";
import { validateDraft } from "../validate-draft";
import {
  assembleFirstMessage,
  classifySite,
  cleanOffer,
  composeObservation,
  composeShortObservation,
  composeSubject,
  displayName,
  tidyOffer,
  type FirstMessageFacts,
} from "./compose-first-message";

const facts = (over: Partial<FirstMessageFacts> = {}): FirstMessageFacts => ({
  language: "tr",
  channel: "EMAIL",
  businessName: "Gülşen Diş Kliniği",
  category: "Diş Kliniği",
  rating: 4.7,
  reviewCount: 212,
  websiteIssues: [],
  websiteStatus: "NO_WEBSITE",
  ...over,
});

const OFFER_TR = "Biz bir yazılım şirketiyiz; işletmelere hızlı ve mobil uyumlu web siteleri hazırlıyoruz. Size özel ücretsiz bir örnek tasarım hazırlayıp kısa bir görüşmede paylaşmak isteriz. Bu hafta uygun bir saatiniz var mı?";
const OFFER_EN = "We are a software company that builds fast, mobile-friendly websites. We would be happy to prepare a free sample design and share it in a short call. Would you have time this week?";

describe("classifySite", () => {
  it("verilen website_status'a göre karar verir (analiz yoksa iddia edilmez)", () => {
    expect(classifySite({ websiteIssues: [], websiteStatus: "NO_WEBSITE" }).kind).toBe("NONE");
    expect(classifySite({ websiteIssues: [], websiteStatus: "BROKEN_WEBSITE" }).kind).toBe("BROKEN");
    expect(classifySite({ websiteIssues: ["x"], websiteStatus: "LOW_QUALITY_WEBSITE" }).kind).toBe("WEAK");
    expect(classifySite({ websiteIssues: [], websiteStatus: null }).kind).toBe("UNKNOWN");
    expect(classifySite({ websiteIssues: [], websiteStatus: "GOOD_WEBSITE" }).kind).toBe("UNKNOWN");
  });

  it("durum verilmediyse sorun metinlerinden çıkarır; bot engeli site sorunu sayılmaz", () => {
    expect(classifySite({ websiteIssues: [] }).kind).toBe("NONE");
    expect(classifySite({ websiteIssues: ["Site açılamadı: bağlantı zaman aşımı"] }).kind).toBe("BROKEN");
    expect(classifySite({ websiteIssues: ["Mobil uyum etiketi yok."] }).kind).toBe("WEAK");
    expect(classifySite({ websiteIssues: ["Site HTTP 403 döndürdü."] }).kind).toBe("UNKNOWN");
  });
});

describe("composeObservation", () => {
  it("sitesi olmayan işletmeye Türkçe, işletmeye özel ve olgusal gözlem yazar", () => {
    const text = composeObservation(facts());
    expect(text).toContain("Gülşen Diş Kliniği");
    expect(text).toMatch(/212 yorum/);
    expect(text).toMatch(/4,7 puan/);
    expect(text).toMatch(/web sitesi bulunmuyor/);
    expect(text).toMatch(/hastalar/);
  });

  it("açılmayan siteyi dürüstçe anlatır", () => {
    expect(composeObservation(facts({ websiteStatus: "BROKEN_WEBSITE", websiteIssues: ["Site açılamadı: x"] }))).toMatch(/sayfa açılmadı/);
  });

  it("zayıf sitede en çok iki gerçek sorunu okunur cümleyle yazar", () => {
    const text = composeObservation(
      facts({
        websiteStatus: "LOW_QUALITY_WEBSITE",
        websiteIssues: ["Site HTTPS kullanmıyor (güvenli değil).", "Mobil uyum etiketi yok.", "Randevu sistemi bulunamadı."],
      }),
    );
    expect(text).toContain("güvenli bağlantının (HTTPS) bulunmaması");
    expect(text).toContain("mobil cihazlarda düzgün görünmemesi");
    expect(text).not.toMatch(/randevu/);
  });

  it("puan katmanları: yüksek puan övülür, orta puan yalnızca olgudur, düşük puan veya az yorum anılmaz", () => {
    expect(composeObservation(facts({ rating: 4.8 }))).toMatch(/4,8/);
    expect(composeObservation(facts({ rating: 4.1, reviewCount: 133 }))).toMatch(/133 yorum ve 4,1 puan görüyoruz\./);
    expect(composeObservation(facts({ rating: 4.1, reviewCount: 133 }))).not.toMatch(/güçlü bir itibar|öne çıkıyor/);
    expect(composeObservation(facts({ rating: 3.2, reviewCount: 80 }))).not.toMatch(/puan/);
    expect(composeObservation(facts({ rating: 4.9, reviewCount: 4 }))).not.toMatch(/puan/);
  });

  it("aynı işletme her seferinde aynı çeşidi alır", () => {
    expect(composeObservation(facts())).toBe(composeObservation(facts()));
  });

  it("İngilizcede düzgün ve yalnızca İngilizce sözcük kullanır", () => {
    const text = composeObservation(
      facts({ language: "en", businessName: "Maple Street Dental", category: "Dental Clinic", websiteStatus: "NO_WEBSITE" }),
    );
    expect(text).toMatch(/241|212/);
    expect(text).toMatch(/patients searching for you online/);
    expect(findForeignWords(text, "en", ["Maple Street Dental"])).toEqual([]);
  });

  it("yüzde işareti, fiyat veya yasaklı sözcük içermez", () => {
    for (const status of ["NO_WEBSITE", "BROKEN_WEBSITE", "LOW_QUALITY_WEBSITE", null]) {
      for (const language of ["tr", "en"] as const) {
        const text = composeObservation(facts({ language, websiteStatus: status, websiteIssues: status === "LOW_QUALITY_WEBSITE" ? ["Mobil uyum etiketi yok."] : [] }));
        expect(text).not.toMatch(/%|indirim|bedava|garanti|discount|free|guarantee/i);
      }
    }
  });
});

describe("composeSubject / composeShortObservation", () => {
  it("konu satırı işletme adını ve durumu içerir, alakasız cümle içermez", () => {
    expect(composeSubject(facts())).toBe("Gülşen Diş Kliniği için web sitesi önerisi");
    expect(composeSubject(facts({ websiteStatus: "LOW_QUALITY_WEBSITE", websiteIssues: ["x"] }))).toBe(
      "Gülşen Diş Kliniği web sitesi hakkında kısa bir öneri",
    );
    expect(composeSubject(facts({ language: "en", businessName: "Maple Dental" }))).toBe("A website idea for Maple Dental");
  });

  it("DM gözlemi tek cümledir", () => {
    const text = composeShortObservation(facts({ channel: "INSTAGRAM" }));
    expect(text.split(/[.!?]/).filter((s) => s.trim()).length).toBe(1);
  });
});

describe("cleanOffer", () => {
  it("modelin eklediği selamlama ve imza satırlarını atar", () => {
    expect(cleanOffer("Merhaba,\nBiz bir yazılım şirketiyiz.\nSaygılarımla")).toBe("Biz bir yazılım şirketiyiz.");
    expect(cleanOffer("Hello,\n\nWe build websites.\n\nBest regards")).toBe("We build websites.");
  });

  it("boş veya yalnızca selamlama ise boş döner", () => {
    expect(cleanOffer("  \n Merhaba,\n")).toBe("");
  });
});

describe("assembleFirstMessage", () => {
  it("e-postada selamlama, gözlem, teklif ve kapanışı sırayla birleştirir", () => {
    const { subject, body } = assembleFirstMessage(facts(), OFFER_TR);
    expect(subject).toBe("Gülşen Diş Kliniği için web sitesi önerisi");
    const parts = body.split("\n\n");
    expect(parts[0]).toBe("Merhaba,");
    expect(parts[1]).toContain("Gülşen Diş Kliniği");
    expect(parts[2]).toBe(OFFER_TR);
    expect(parts[3]).toBe("Saygılarımla");
  });

  it("DM'de kısa selamlama + tek cümle gözlem + teklif; kapanış yoktur", () => {
    const { body } = assembleFirstMessage(facts({ channel: "INSTAGRAM" }), "Kısa bir görüşme ister misiniz?");
    expect(body.startsWith("Merhaba, ")).toBe(true);
    expect(body).not.toMatch(/Saygılarımla/);
    expect(body.split("\n\n")).toHaveLength(2);
  });

  it("Türkçe ve İngilizce tam mesajlar doğru dilde algılanır, yabancı sözcük sızmaz ve güvenlik kontrolünden geçer", () => {
    for (const language of ["tr", "en"] as const) {
      const input = facts(
        language === "tr"
          ? {}
          : { language, businessName: "Maple Street Dental", category: "Dental Clinic", rating: 4.8, reviewCount: 241 },
      );
      const { body } = assembleFirstMessage(input, language === "tr" ? OFFER_TR : OFFER_EN);
      expect(detectDraftLanguage(body)).toBe(language);
      expect(findForeignWords(body, language, [input.businessName, input.category ?? ""])).toEqual([]);
      const result = validateDraft({
        body,
        channel: "EMAIL",
        packages: [],
        salesRules: { allowDiscountMention: false, forbiddenWords: ["indirim", "%", "bedava", "garanti", "discount", "guarantee"] },
        verifiedReferenceNames: [],
        recipientBusinessName: input.businessName,
        contextNames: [input.category ?? ""],
        stopRequest: false,
      });
      expect(result.reasons).toEqual([]);
      expect(result.ok).toBe(true);
    }
  });
});

describe("displayName", () => {
  it("unvan/slogan ekini atar, düz adı korur", () => {
    expect(displayName("Hakan Kaymaz | Osteopat Fizyoterapist")).toBe("Hakan Kaymaz");
    expect(displayName("Gülşen Diş Kliniği - Şişli")).toBe("Gülşen Diş Kliniği");
    expect(displayName("Gülşen Diş Kliniği")).toBe("Gülşen Diş Kliniği");
  });

  it("gözlem ve konu satırında kısa ad kullanılır", () => {
    const f = facts({ businessName: "Hakan Kaymaz | Osteopat Fizyoterapist", channel: "WHATSAPP" });
    expect(composeObservation(f)).not.toContain("|");
    expect(composeShortObservation(f)).toBe("Hakan Kaymaz için Google'da iyi yorumlar görüyoruz ancak web siteniz yok.");
    expect(composeSubject(f)).toBe("Hakan Kaymaz için web sitesi önerisi");
  });
});

describe("tidyOffer", () => {
  const dm = facts({ channel: "WHATSAPP", businessName: "Hakan Kaymaz | Osteopat Fizyoterapist", rating: 4.9, reviewCount: 40 });

  it("gözlemi yineleyen, süslü veya yabancı kelimeli cümleleri atar; hitabı siler", () => {
    const raw =
      "Hakan Bey, Şişli'de osteopat pratiğiniz için Google üzerindeki harika 4,9 puanını görmek güzel. Web siteniz bulunmaması hastaların size ulaşmasını zorlaştırıyor. " +
      "Hostlys olarak, işletmenizin ruhunu yansıtan bir web presence tasarlıyoruz. Size özel ücretsiz bir örnek tasarım hazırlayabiliriz. Kısa bir görüşme ister misiniz?";
    expect(tidyOffer(raw, dm)).toBe("Size özel ücretsiz bir örnek tasarım hazırlayabiliriz. Kısa bir görüşme ister misiniz?");
  });

  it("DM'de uzun teklifi sınırda keser; hiçbir cümle kalmazsa boş döner", () => {
    const long = Array.from({ length: 10 }, () => "Size özel hazırladığımız örnek tasarımı kısa bir görüşmede gösterebiliriz.").join(" ");
    expect(tidyOffer(long, dm).split(/\s+/).length).toBeLessThanOrEqual(38);
    expect(tidyOffer("Web siteniz yok. Harika 4,9 puanınız var.", dm)).toBe("");
  });

  it("'4.9' gibi ondalıklı sayıyı cümle sonu sanıp bölmez; kısa artık parça bırakmaz", () => {
    expect(tidyOffer("Şişli'de 4.9 puanla ilgi görüyor. Hostlys ekibi size özel web çözümleri geliştiriyor.", dm)).toBe(
      "Hostlys ekibi size özel web çözümleri geliştiriyor. Size kısa bir örnek göndermemizi ister misiniz?",
    );
    expect(tidyOffer("Şişli'de 4.", dm)).toBe("");
  });

  it("ekli halleri de gözlem tekrarı sayar ('puanla'), vizyon klişesini atar ve soruyla bitirir", () => {
    const out = tidyOffer(
      "Şişli'de 4,9 puanla ilgi görüyor. Hostlys ekibi size özel web çözümleri geliştiriyor. Şirketinizin vizyonuna uygun ücretsiz örnek tasarım hazırlayalım.",
      dm,
    );
    expect(out).toBe("Hostlys ekibi size özel web çözümleri geliştiriyor. Size kısa bir örnek göndermemizi ister misiniz?");
  });
});
