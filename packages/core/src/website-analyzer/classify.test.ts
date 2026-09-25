import { describe, expect, it } from "vitest";
import { classifyOpenWebsite } from "./classify";
import type { WebsiteChecks } from "./types";

const goodChecks: WebsiteChecks = {
  https: true,
  redirectProblem: false,
  responsive: true,
  hasPhoneLink: true,
  hasEmailLink: true,
  hasWhatsappLink: false,
  hasContactForm: true,
  hasBookingWidget: true,
  hasSocialLinks: true,
  hasMetaTitle: true,
  hasMetaDescription: true,
  slowResponse: false,
  staleSignals: false,
  mixedContent: false,
  jsRendered: false,
};

describe("classifyOpenWebsite", () => {
  it("classifies a fully healthy site as GOOD_WEBSITE with no issues", () => {
    const result = classifyOpenWebsite({ checks: goodChecks, hasAnyContact: true });
    expect(result.status).toBe("GOOD_WEBSITE");
    expect(result.issues).toHaveLength(0);
  });

  it("classifies a site missing HTTPS + viewport + contact as LOW_QUALITY (score 6)", () => {
    const checks: WebsiteChecks = { ...goodChecks, https: false, responsive: false, hasContactForm: false };
    const result = classifyOpenWebsite({ checks, hasAnyContact: false });
    expect(result.status).toBe("LOW_QUALITY_WEBSITE");
    expect(result.issues).toContain("Site HTTPS kullanmıyor (güvenli değil).");
    expect(result.issues).toContain("Mobil uyum etiketi yok.");
  });

  it("stays GOOD_WEBSITE when score is below the threshold (single issue)", () => {
    const checks: WebsiteChecks = { ...goodChecks, slowResponse: true };
    const result = classifyOpenWebsite({ checks, hasAnyContact: true });
    expect(result.status).toBe("GOOD_WEBSITE");
    expect(result.issues).toContain("Sayfa yanıt süresi 3 saniyeden uzun.");
  });

  it("tips into LOW_QUALITY_WEBSITE at exactly score 3", () => {
    const checks: WebsiteChecks = { ...goodChecks, hasMetaTitle: false, slowResponse: true, staleSignals: true };
    const result = classifyOpenWebsite({ checks, hasAnyContact: true });
    expect(result.status).toBe("LOW_QUALITY_WEBSITE");
  });

  it("penalizes a booking-required category with no booking widget", () => {
    const checks: WebsiteChecks = { ...goodChecks, hasBookingWidget: false };
    const withCategory = classifyOpenWebsite({ checks, hasAnyContact: true, category: "Diş Kliniği" });
    expect(withCategory.issues).toContain("Randevu sistemi bulunamadı.");

    const withoutCategory = classifyOpenWebsite({ checks, hasAnyContact: true, category: "Kırtasiye" });
    expect(withoutCategory.issues).not.toContain("Randevu sistemi bulunamadı.");
  });

  it("does not penalize missing booking widget when no category is given", () => {
    const checks: WebsiteChecks = { ...goodChecks, hasBookingWidget: false };
    const result = classifyOpenWebsite({ checks, hasAnyContact: true });
    expect(result.issues).not.toContain("Randevu sistemi bulunamadı.");
  });

  it("reports redirect/mixed-content/JS-rendered as informational issues without adding to the score", () => {
    const checks: WebsiteChecks = { ...goodChecks, redirectProblem: true, mixedContent: true, jsRendered: true };
    const result = classifyOpenWebsite({ checks, hasAnyContact: true });
    expect(result.status).toBe("GOOD_WEBSITE");
    expect(result.issues).toEqual(
      expect.arrayContaining([
        "Aşırı yönlendirme zinciri var.",
        "HTTPS sayfada güvensiz (http://) kaynaklar yükleniyor.",
        "Sayfa JS ile render ediliyor gibi görünüyor, manuel kontrol önerilir.",
      ]),
    );
  });

  it("treats a contact form as sufficient even without any extracted contact", () => {
    const checks: WebsiteChecks = { ...goodChecks, hasContactForm: true };
    const result = classifyOpenWebsite({ checks, hasAnyContact: false });
    expect(result.issues).not.toContain(
      "Sitede telefon, e-posta, WhatsApp linki veya iletişim formu bulunamadı.",
    );
  });
});
