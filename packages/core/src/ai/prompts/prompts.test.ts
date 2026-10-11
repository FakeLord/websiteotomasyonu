import { describe, expect, it } from "vitest";
import { buildDraftFirstMessagePrompt } from "./draft-first-message";
import { buildClassifyReplyPrompt, hasStopKeyword } from "./classify-reply";
import { buildDraftReplyPrompt } from "./draft-reply";
import { buildUpdateSummaryPrompt } from "./update-summary";
import { buildGenerateHandoffPrompt } from "./generate-handoff";
import { buildFollowupDraftPrompt } from "./followup-draft";

const EXTRA = { city: null, rating: null, reviewCount: null, language: "tr" as const, companyFacts: "Biz bir yazılım şirketiyiz." };

describe("buildDraftFirstMessagePrompt", () => {
  it("mentions the channel and writes at most two real website problems into the ready observation", () => {
    const req = buildDraftFirstMessagePrompt({
      businessName: "ABC Diş Kliniği",
      category: "Diş Kliniği",
      district: "Kadıköy",
      websiteIssues: [
        "Site HTTPS kullanmıyor (güvenli değil).",
        "Mobil uyum etiketi yok.",
        "Randevu sistemi bulunamadı.",
        "Sayfa yanıt süresi 3 saniyeden uzun.",
      ],
      websiteStatus: "LOW_QUALITY_WEBSITE",
      channel: "EMAIL",
      ...EXTRA,
      relevantPackages: [],
      salesRulesSummary: "",
    });
    expect(req.operation).toBe("draft_first_message");
    expect(req.system).toContain("EMAIL");
    expect(req.system).toContain("uydurma");
    const userMessage = req.messages[0]?.content ?? "";
    expect(userMessage).toContain("güvenli bağlantının (HTTPS) bulunmaması");
    expect(userMessage).toContain("mobil cihazlarda düzgün görünmemesi");
    expect(userMessage).not.toMatch(/randevu alınabilecek/);
  });

  it("says the business has no website when the status is NO_WEBSITE", () => {
    const req = buildDraftFirstMessagePrompt({
      businessName: "XYZ",
      category: null,
      district: null,
      websiteIssues: [],
      channel: "INSTAGRAM",
      ...EXTRA,
      relevantPackages: [],
      salesRulesSummary: "",
    });
    expect(req.messages[0]?.content).toMatch(/web sitesi bulunmuyor|web siteniz yok/);
  });
});

describe("buildDraftFirstMessagePrompt — imza ve bot engeli", () => {
  const base = {
    businessName: "Austin Primary Dental",
    category: "Dentist",
    district: null,
    channel: "EMAIL" as const,
    ...EXTRA,
    relevantPackages: [],
    salesRulesSummary: "",
  };

  it("modele isim/unvan/rol imzası eklememesini söyler (ör. 'Satış Asistanı' referans sanılıyordu)", () => {
    const req = buildDraftFirstMessagePrompt({ ...base, websiteIssues: [] });
    expect(req.system).toMatch(/imza|unvan/i);
  });

  it("otomatik erişimi engelleyen sitenin HTTP hatasını işletmeye söylenecek sorun olarak vermez", () => {
    const req = buildDraftFirstMessagePrompt({
      ...base,
      websiteIssues: ["Site HTTP 403 döndürdü; otomatik erişimi engelliyor olabilir, tarayıcıda açılıyorsa elle kontrol edin."],
    });
    const text = req.messages[0]?.content ?? "";
    expect(text).not.toContain("403");
    // Site muhtemelen açılıyor: ne "site yok" ne "site bozuk" iddia edilir; gözlem yalnızca işletme görünürlüğüne dairdir.
    expect(text).not.toMatch(/web sitesi bulunmuyor|sayfa açılmadı|eksik/);
    expect(text).toMatch(/internetteki görünürlüğünü/);
  });

  it("eski kayıtlardaki ipucusuz 401/403/429 metinlerini de eler, gerçek sorunları korur", () => {
    const req = buildDraftFirstMessagePrompt({
      ...base,
      websiteIssues: ["Site HTTP 429 döndürdü.", "Site HTTPS kullanmıyor."],
    });
    const text = req.messages[0]?.content ?? "";
    expect(text).not.toContain("429");
    expect(text).toContain("güvenli bağlantının (HTTPS) bulunmaması");
  });

  it("404 gibi gerçek hataları korur (site gerçekten yok)", () => {
    const req = buildDraftFirstMessagePrompt({ ...base, websiteIssues: ["Site HTTP 404 döndürdü."] });
    // Gerçek hata: site açılmıyor. Ham HTTP kodu işletmeye söylenmez, ama gözlem "sayfa açılmadı" der.
    expect(req.messages[0]?.content).toMatch(/sayfa açılmadı/);
  });
});

describe("buildClassifyReplyPrompt / hasStopKeyword", () => {
  it("builds a low-temperature classification request", () => {
    const req = buildClassifyReplyPrompt({ lastInboundMessage: "Fiyat nedir?", conversationSummary: "" });
    expect(req.temperature).toBeLessThan(0.5);
    expect(req.messages[0]?.content).toContain("Fiyat nedir?");
  });

  it("offers the auto-reply / wrong-contact / has-provider intents to the model", () => {
    const req = buildClassifyReplyPrompt({ lastInboundMessage: "İzindeyim", conversationSummary: "" });
    const schema = JSON.stringify(req.jsonSchema);
    for (const intent of ["AUTO_REPLY", "WRONG_CONTACT", "ALREADY_HAS_PROVIDER"]) {
      expect(schema).toContain(intent);
      expect(req.system).toContain(intent);
    }
  });

  it("detects a Turkish stop keyword", () => {
    expect(hasStopKeyword("lütfen bir daha yazmayın")).toBe(true);
    expect(hasStopKeyword("teşekkürler, ilgileniyorum")).toBe(false);
  });

  it("detects replies to the e-mail footer opt-out line and common English phrases (ADR 0019)", () => {
    expect(hasStopKeyword("çıkmak istiyorum")).toBe(true);
    expect(hasStopKeyword("Unsubscribe")).toBe(true);
    expect(hasStopKeyword("Please remove me from your list")).toBe(true);
    expect(hasStopKeyword("Do not contact us again")).toBe(true);
    expect(hasStopKeyword("Sounds good, let's talk next week")).toBe(false);
  });

  it("catches clear stop requests that contain no classic keyword (eval set)", () => {
    expect(hasStopKeyword("Numaramı ve adresimi kayıtlarınızdan silin, bir daha iletişime geçmeyin.")).toBe(true);
    expect(hasStopKeyword("Delete my details from your records and do not reach out to us again.")).toBe(true);
    expect(hasStopKeyword("We'd love to hear more, please reach out to us tomorrow")).toBe(false);
  });
});

describe("buildDraftReplyPrompt", () => {
  it("includes only the last 4 messages and relevant KB entries", () => {
    const req = buildDraftReplyPrompt({
      conversationSummary: "Müşteri fiyat sordu.",
      lastMessages: [
        { direction: "IN", body: "m1" },
        { direction: "OUT", body: "m2" },
        { direction: "IN", body: "m3" },
        { direction: "OUT", body: "m4" },
        { direction: "IN", body: "m5" },
      ],
      intent: "QUESTION",
      relevantKb: [{ id: "kb-1", title: "Fiyatlandırma", content: "..." }],
      channel: "EMAIL",
    });
    const content = req.messages[0]?.content ?? "";
    expect(content).not.toContain("m1");
    expect(content).toContain("m5");
    expect(content).toContain("kb-1");
  });
});

describe("buildUpdateSummaryPrompt", () => {
  it("references the previous summary and new messages", () => {
    const req = buildUpdateSummaryPrompt({
      previousSummary: "Önceki özet",
      newMessages: [{ direction: "IN", body: "Yeni mesaj" }],
    });
    expect(req.messages[0]?.content).toContain("Önceki özet");
    expect(req.messages[0]?.content).toContain("Yeni mesaj");
  });
});

describe("buildGenerateHandoffPrompt", () => {
  it("lists available packages by id", () => {
    const req = buildGenerateHandoffPrompt({
      conversationSummary: "özet",
      requirements: ["logo"],
      availablePackages: [{ id: "pkg-1", name: "Website", summary: "", priceMin: null, priceMax: null, deliveryDaysMin: null, deliveryDaysMax: null }],
    });
    expect(req.messages[0]?.content).toContain("pkg-1");
  });
});

describe("buildFollowupDraftPrompt", () => {
  it("includes the step number and first message", () => {
    const req = buildFollowupDraftPrompt({ firstMessageBody: "İlk mesaj metni", stepNumber: 2, businessName: "ABC" });
    expect(req.messages[0]?.content).toContain("2. hatırlatma");
    expect(req.messages[0]?.content).toContain("İlk mesaj metni");
  });
});

describe("buildDraftReplyPrompt — dil ve biçim (v2)", () => {
  const input = {
    conversationSummary: "",
    lastMessages: [{ direction: "IN" as const, body: "Fiyat nedir?" }],
    intent: "QUESTION",
    relevantKb: [],
    channel: "EMAIL" as const,
  };

  it("varsayılan Türkçe; İngilizce istenince İngilizce komut verir", () => {
    expect(buildDraftReplyPrompt(input).system).toMatch(/düzgün bir Türkçeyle/);
    const en = buildDraftReplyPrompt({ ...input, language: "en" });
    expect(en.system).toMatch(/natural, simple, fluent English/);
    expect(en.system).toContain("English");
  });

  it("kısa yazmayı, imza/unvan yazmamayı ve ısrar etmemeyi söyler; sürüm 2", () => {
    const req = buildDraftReplyPrompt(input);
    expect(req.system).toMatch(/En çok 60 kelime/);
    expect(req.system).toMatch(/imza, unvan/);
    expect(req.system).toMatch(/ısrar etme/);
    expect(req.promptVersion).toBe(2);
  });
});
