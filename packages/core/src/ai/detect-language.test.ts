import { describe, expect, it } from "vitest";
import { detectDraftLanguage } from "./detect-language";

const TURKISH =
  "DTLA Smile ekibi,\n\nLos Angeles'ın kalbinde bulunan, 4.8 puan (158 yorum) değerine sahip bir diş kliniği olarak " +
  "dikkatimizi çektiniz. Sitenizin bulunamaması potansiyel hastalarınızın sizi bulmasını zorlaştırıyor. " +
  "Size özel ücretsiz bir örnek tasarım hazırlamak isteriz.\n\nSaygılarımla,";

const ENGLISH =
  "Hi DTLA Smile team,\n\nYour 4.8 rating across 158 reviews shows how much patients trust you, but we could not find a " +
  "website for the clinic. We build modern, premium websites for businesses like yours and would love to prepare a " +
  "free sample design for you.\n\nBest regards,";

describe("detectDraftLanguage", () => {
  it("Türkçe metni tanır", () => {
    expect(detectDraftLanguage(TURKISH)).toBe("tr");
  });

  it("İngilizce metni tanır (içinde Türkçe işletme adı geçse bile)", () => {
    expect(detectDraftLanguage(ENGLISH)).toBe("en");
    expect(detectDraftLanguage(`Hi Kırmızı Gül Kuaför team, we would love to build a new website for your salon and your customers.`)).toBe("en");
  });

  it("aksansız yazılmış Türkçeyi de kelimelerinden tanır", () => {
    expect(detectDraftLanguage("Merhaba, sizin icin bir web sitesi ve mobil uygulama hazirlamak istiyoruz, bu konuda bir gorusme yapalim.")).toBe("tr");
  });

  it("karar veremeyeceği kadar kısa veya belirsiz metinde 'unknown' döner", () => {
    expect(detectDraftLanguage("OK")).toBe("unknown");
    expect(detectDraftLanguage("")).toBe("unknown");
  });
});
