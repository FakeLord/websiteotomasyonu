import type { WebsiteChecks } from "./types";

const BOOKING_CATEGORY_PATTERN = /diş|klinik|kuaför|berber|güzellik|spa|masaj|veteriner|randevu/i;

export interface ClassifyInput {
  checks: WebsiteChecks;
  hasAnyContact: boolean;
  category?: string | undefined;
}

export interface ClassifyResult {
  status: "LOW_QUALITY_WEBSITE" | "GOOD_WEBSITE";
  issues: string[];
}

/**
 * H bölümündeki "sorun puanı" tablosu. Skor ≥ 3 → LOW_QUALITY_WEBSITE.
 * Her sorun `issues`'a Türkçe, insan-okunur bir cümle olarak eklenir (AI ilk
 * mesajda kullanır).
 */
export function classifyOpenWebsite(input: ClassifyInput): ClassifyResult {
  const { checks } = input;
  let score = 0;
  const issues: string[] = [];

  if (!checks.https) {
    score += 2;
    issues.push("Site HTTPS kullanmıyor (güvenli değil).");
  }
  if (!checks.responsive) {
    score += 2;
    issues.push("Mobil uyum etiketi yok.");
  }
  if (!input.hasAnyContact && !checks.hasContactForm) {
    score += 2;
    issues.push("Sitede telefon, e-posta, WhatsApp linki veya iletişim formu bulunamadı.");
  }

  const needsBooking = input.category ? BOOKING_CATEGORY_PATTERN.test(input.category) : false;
  if (needsBooking && !checks.hasBookingWidget) {
    score += 1;
    issues.push("Randevu sistemi bulunamadı.");
  }

  if (!checks.hasMetaTitle || !checks.hasMetaDescription) {
    score += 1;
    issues.push("Sayfa başlığı veya açıklaması eksik/kısa (SEO sorunu).");
  }

  if (checks.slowResponse) {
    score += 1;
    issues.push("Sayfa yanıt süresi 3 saniyeden uzun.");
  }

  if (checks.staleSignals) {
    score += 1;
    issues.push("Site eski görünüyor (güncel olmayan teknoloji/telif yılı).");
  }

  if (checks.redirectProblem) {
    issues.push("Aşırı yönlendirme zinciri var.");
  }
  if (checks.mixedContent) {
    issues.push("HTTPS sayfada güvensiz (http://) kaynaklar yükleniyor.");
  }
  if (checks.jsRendered) {
    issues.push("Sayfa JS ile render ediliyor gibi görünüyor, manuel kontrol önerilir.");
  }

  return {
    status: score >= 3 ? "LOW_QUALITY_WEBSITE" : "GOOD_WEBSITE",
    issues,
  };
}
