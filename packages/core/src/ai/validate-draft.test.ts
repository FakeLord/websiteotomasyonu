import { describe, expect, it } from "vitest";
import { validateDraft, type ValidateDraftInput } from "./validate-draft";

const basePackages = [
  { id: "p1", name: "Website Paketi", summary: "", priceMin: 5000, priceMax: 15000, deliveryDaysMin: 7, deliveryDaysMax: 21 },
];

const baseInput: ValidateDraftInput = {
  body: "Merhaba, işletmenizin web sitesini inceledik ve size yardımcı olmak isteriz.",
  channel: "EMAIL",
  packages: basePackages,
  salesRules: { allowDiscountMention: false, forbiddenWords: ["indirim", "%", "bedava", "garanti"] },
  verifiedReferenceNames: [],
  stopRequest: false,
};

describe("validateDraft", () => {
  it("accepts a clean draft with no price/discount/reference/delivery mentions", () => {
    const result = validateDraft(baseInput);
    expect(result).toEqual({ ok: true, reasons: [] });
  });

  it("rejects immediately when stopRequest is true, regardless of content", () => {
    const result = validateDraft({ ...baseInput, stopRequest: true });
    expect(result).toEqual({ ok: false, reasons: ["STOP_REQUEST"] });
  });

  it("rejects a draft exceeding the Instagram 600-character limit", () => {
    const result = validateDraft({ ...baseInput, channel: "INSTAGRAM", body: "a".repeat(601) });
    expect(result.ok).toBe(false);
    expect(result.reasons).toContainEqual(expect.stringContaining("LENGTH_EXCEEDED:INSTAGRAM"));
  });

  it("accepts a draft right at the email 1200-character limit", () => {
    const result = validateDraft({ ...baseInput, body: "a".repeat(1200) });
    expect(result.ok).toBe(true);
  });

  it("accepts a price mentioned within an active package's range", () => {
    const result = validateDraft({ ...baseInput, body: "Website paketimiz 10.000 TL'dir." });
    expect(result.ok).toBe(true);
  });

  it("rejects a price outside every active package's range", () => {
    const result = validateDraft({ ...baseInput, body: "Website paketimiz 500 TL'dir." });
    expect(result.ok).toBe(false);
    expect(result.reasons.some((r) => r.startsWith("PRICE_MISMATCH"))).toBe(true);
  });

  it("recognizes a 'bin TL' shorthand price", () => {
    const result = validateDraft({ ...baseInput, body: "Fiyatımız 10 bin TL civarındadır." });
    expect(result.ok).toBe(true);
  });

  it("rejects a forbidden discount word when sales_rules disallows it", () => {
    const result = validateDraft({ ...baseInput, body: "Bu ay %20 indirim fırsatını kaçırmayın!" });
    expect(result.ok).toBe(false);
    expect(result.reasons).toContainEqual(expect.stringContaining("FORBIDDEN_WORD"));
  });

  it("allows a discount word when sales_rules explicitly permits it", () => {
    const result = validateDraft({
      ...baseInput,
      body: "Bu ay %20 indirim fırsatını kaçırmayın!",
      salesRules: { allowDiscountMention: true, forbiddenWords: ["indirim", "%"] },
    });
    expect(result.ok).toBe(true);
  });

  it("rejects an unverified customer/brand reference", () => {
    const result = validateDraft({ ...baseInput, body: "Ahmet Yılmaz Kliniği için de benzer bir site yaptık." });
    expect(result.ok).toBe(false);
    expect(result.reasons.some((r) => r.startsWith("UNVERIFIED_REFERENCE"))).toBe(true);
  });

  it("accepts a reference name that is in the verified list", () => {
    const result = validateDraft({
      ...baseInput,
      body: "Ahmet Yılmaz Kliniği için de benzer bir site yaptık.",
      verifiedReferenceNames: ["Ahmet Yılmaz Kliniği"],
    });
    expect(result.ok).toBe(true);
  });

  it("does not flag the recipient's own business name as an unverified reference", () => {
    const result = validateDraft({
      ...baseInput,
      body: "ABC Diş Kliniği için özel bir teklif hazırladık.",
      recipientBusinessName: "ABC Diş Kliniği",
    });
    expect(result.ok).toBe(true);
  });

  it("recognizes an ALL-CAPS English business name written in title case (Turkish locale must not turn I into ı)", () => {
    const result = validateDraft({
      ...baseInput,
      body: "Merhaba Windy Hair Salon Original ekibi, Instagram sayfanızı beğendik.",
      recipientBusinessName: "WINDY HAIR SALON ORIGINAL",
    });
    expect(result.reasons).toEqual([]);
  });

  it("recognizes an ALL-CAPS Turkish business name written in title case", () => {
    const result = validateDraft({
      ...baseInput,
      body: "Merhaba Kırmızı Gül Kuaför ekibi, harika bir yer.",
      recipientBusinessName: "KIRMIZI GÜL KUAFÖR",
    });
    expect(result.reasons).toEqual([]);
  });

  it("matches verified references regardless of dotted/dotless i and diacritics", () => {
    const result = validateDraft({
      ...baseInput,
      body: "Daha önce Işık Dental Kliniği ile çalıştık.",
      verifiedReferenceNames: ["ISIK DENTAL KLINIGI"],
    });
    expect(result.reasons).toEqual([]);
  });

  it("does not treat a generic role title in the sign-off as a customer reference", () => {
    for (const title of ["Satış Asistanı", "Müşteri Temsilcisi", "Satış Ekibi", "SATIŞ ASİSTANI"]) {
      const result = validateDraft({
        ...baseInput,
        body: `Merhaba DTLA Smile ekibi, web sitenizle ilgili bir fikrimiz var.\n\nSaygılarımla,\n${title}`,
        recipientBusinessName: "DTLA Smile",
      });
      expect(result.reasons, title).toEqual([]);
    }
  });

  it("does not flag Turkish team salutations like 'Sayın X Ekibi' as customer references", () => {
    for (const salutation of ["Sayın DTLA Smile Ekibi", "Merhaba DTLA Smile Ekibine", "Değerli DTLA Smile Yetkilisi"]) {
      const result = validateDraft({
        ...baseInput,
        body: `${salutation},\n\nWeb siteniz için bir fikrimiz var.\n\nSaygılarımla,`,
        recipientBusinessName: "DTLA Smile",
      });
      expect(result.reasons, salutation).toEqual([]);
    }
  });

  it("flags a price quoted in euros, pounds or dollars that no package covers", () => {
    for (const text of ["only €500", "just £400 per month", "from $300", "for 500 USD", "for 250 euros"]) {
      const result = validateDraft({ ...baseInput, body: `Hello team, we can build it ${text}.` });
      expect(result.reasons.some((r) => r.startsWith("PRICE_MISMATCH")), text).toBe(true);
    }
  });

  it("flags English delivery promises outside package ranges and accepts those inside", () => {
    const bad = validateDraft({ ...baseInput, body: "We can deliver in 3 days." });
    expect(bad.reasons.some((r) => r.startsWith("DELIVERY_MISMATCH"))).toBe(true);
    const bad2 = validateDraft({ ...baseInput, body: "Ready within 6 weeks." });
    expect(bad2.reasons.some((r) => r.startsWith("DELIVERY_MISMATCH"))).toBe(true);
    const ok = validateDraft({ ...baseInput, body: "Delivery in 2 weeks." });
    expect(ok.reasons).toEqual([]);
  });

  it("does not flag English greetings, closings and 'Team' as customer references", () => {
    const result = validateDraft({
      ...baseInput,
      body: "Hi Windy Hair Salon Original Team,\n\nWe build modern websites.\n\nBest Regards,",
      recipientBusinessName: "WINDY HAIR SALON ORIGINAL",
    });
    expect(result.reasons).toEqual([]);
  });

  it("still flags a genuinely different English company name", () => {
    const result = validateDraft({
      ...baseInput,
      body: "Hello Austin Primary Dental team, we built a site for Sunny Beauty Studio.",
      recipientBusinessName: "Austin Primary Dental",
    });
    expect(result.reasons).toEqual(["UNVERIFIED_REFERENCE:Sunny Beauty Studio"]);
  });

  it("still flags a genuinely different name", () => {
    const result = validateDraft({
      ...baseInput,
      body: "Merhaba Windy Hair Salon Original ekibi, Sunny Beauty Studio ile çalıştık.",
      recipientBusinessName: "WINDY HAIR SALON ORIGINAL",
    });
    expect(result.reasons).toEqual(["UNVERIFIED_REFERENCE:Sunny Beauty Studio"]);
  });

  it("accepts a delivery time within an active package's range", () => {
    const result = validateDraft({ ...baseInput, body: "Projeyi 14 gün içinde teslim ediyoruz." });
    expect(result.ok).toBe(true);
  });

  it("converts weeks to days when checking delivery time", () => {
    const result = validateDraft({ ...baseInput, body: "Projeyi 2 hafta içinde teslim ediyoruz." });
    expect(result.ok).toBe(true);
  });

  it("rejects a delivery time outside every active package's range", () => {
    const result = validateDraft({ ...baseInput, body: "Projeyi 2 gün içinde teslim ediyoruz." });
    expect(result.ok).toBe(false);
    expect(result.reasons.some((r) => r.startsWith("DELIVERY_MISMATCH"))).toBe(true);
  });

  it("collects multiple violations at once", () => {
    const result = validateDraft({
      ...baseInput,
      body: "Ahmet Yılmaz Kliniği'ne 500 TL'ye %20 indirimle 2 gün içinde teslim ettik.",
    });
    expect(result.ok).toBe(false);
    expect(result.reasons.length).toBeGreaterThanOrEqual(3);
  });

  it("does not flag a shortened form of the recipient's own name as a reference", () => {
    const result = validateDraft({
      ...baseInput,
      body: "Merhaba Dişhekimi Tenzil ekibi, web sitenizle ilgili bir fikrimiz var.",
      recipientBusinessName: "Dişhekimi Tenzil ADSIZ ÖZMEN",
    });
    expect(result.reasons.filter((r) => r.startsWith("UNVERIFIED_REFERENCE"))).toEqual([]);
  });

  it("does not flag the recipient's district, city or category as references", () => {
    const result = validateDraft({
      ...baseInput,
      body: "Esenyurt İstanbul bölgesindeki Diş Kliniği işletmeleri için çalışıyoruz.",
      recipientBusinessName: "Yöney Ağız",
      contextNames: ["Esenyurt", "İstanbul", "Diş Kliniği"],
    });
    expect(result.reasons.filter((r) => r.startsWith("UNVERIFIED_REFERENCE"))).toEqual([]);
  });

  it("still flags an unrelated brand mentioned next to the recipient", () => {
    const result = validateDraft({
      ...baseInput,
      body: "Daha önce Mavi Gülüş Kliniği için de site yaptık.",
      recipientBusinessName: "Dişhekimi Tenzil",
    });
    expect(result.reasons).toContainEqual(expect.stringContaining("UNVERIFIED_REFERENCE"));
  });
});
