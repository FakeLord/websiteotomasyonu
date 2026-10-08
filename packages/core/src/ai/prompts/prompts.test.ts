import { describe, expect, it } from "vitest";
import { buildDraftFirstMessagePrompt } from "./draft-first-message";
import { buildClassifyReplyPrompt, hasStopKeyword } from "./classify-reply";
import { buildDraftReplyPrompt } from "./draft-reply";
import { buildUpdateSummaryPrompt } from "./update-summary";
import { buildGenerateHandoffPrompt } from "./generate-handoff";
import { buildFollowupDraftPrompt } from "./followup-draft";

describe("buildDraftFirstMessagePrompt", () => {
  it("includes at most 3 website issues and mentions the channel", () => {
    const req = buildDraftFirstMessagePrompt({
      businessName: "ABC Diş Kliniği",
      category: "Diş Kliniği",
      district: "Kadıköy",
      websiteIssues: ["a", "b", "c", "d", "e"],
      channel: "EMAIL",
      relevantPackages: [],
      salesRulesSummary: "",
    });
    expect(req.operation).toBe("draft_first_message");
    expect(req.system).toContain("EMAIL");
    expect(req.system).toContain("uydurma");
    const userMessage = req.messages[0]?.content ?? "";
    expect(userMessage).toContain("a; b; c");
    expect(userMessage).not.toMatch(/a; b; c; d/);
  });

  it("mentions 'website bulunamadı' when there are no issues (NO_WEBSITE case)", () => {
    const req = buildDraftFirstMessagePrompt({
      businessName: "XYZ",
      category: null,
      district: null,
      websiteIssues: [],
      channel: "INSTAGRAM",
      relevantPackages: [],
      salesRulesSummary: "",
    });
    expect(req.messages[0]?.content).toContain("Website bulunamadı");
  });
});

describe("buildDraftFirstMessagePrompt — imza ve bot engeli", () => {
  const base = {
    businessName: "Austin Primary Dental",
    category: "Dentist",
    district: null,
    channel: "EMAIL" as const,
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
    expect(text).not.toMatch(/Website bulunamadı/);
    expect(text).toMatch(/analiz edilemedi/i);
  });

  it("eski kayıtlardaki ipucusuz 401/403/429 metinlerini de eler, gerçek sorunları korur", () => {
    const req = buildDraftFirstMessagePrompt({
      ...base,
      websiteIssues: ["Site HTTP 429 döndürdü.", "Site HTTPS kullanmıyor."],
    });
    const text = req.messages[0]?.content ?? "";
    expect(text).not.toContain("429");
    expect(text).toContain("Site HTTPS kullanmıyor.");
  });

  it("404 gibi gerçek hataları korur (site gerçekten yok)", () => {
    const req = buildDraftFirstMessagePrompt({ ...base, websiteIssues: ["Site HTTP 404 döndürdü."] });
    expect(req.messages[0]?.content).toContain("404");
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
