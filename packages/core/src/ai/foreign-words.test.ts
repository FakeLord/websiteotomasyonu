import { describe, expect, it } from "vitest";
import { findForeignWords } from "./foreign-words";

describe("findForeignWords — Türkçe metinde İngilizce sızıntısı", () => {
  it("Türkçe cümleye karışan İngilizce kelimeyi yakalar (gerçek vaka)", () => {
    const text =
      "Bahçelievler'de 4.9 puan ile değerli müşterileri olan Klinik Psikolog Havva Gül Dikici, dijital varlığınızı strengthen etmek için layık.";

    expect(findForeignWords(text, "tr")).toEqual(["strengthen"]);
  });

  it("İngilizce işlev kelimelerini yakalar", () => {
    expect(findForeignWords("Size your web sitesi için ücretsiz bir tasarım hazırlayalım.", "tr")).toEqual(["your"]);
  });

  it("temiz Türkçe metinde bir şey bulmaz; Türkçede de geçen kelimeler (can, on, web, online) sorun değildir", () => {
    const text = "Merhaba, Can Bey. On dakikalık bir görüşmede online web tasarımı ve otomasyon çözümlerimizi anlatalım. Saygılarımla";

    expect(findForeignWords(text, "tr")).toEqual([]);
  });

  it("işletme veya şirket adındaki yabancı kelimeleri sorun saymaz", () => {
    const text = "Hair Design Studio için your hostlys ekibi olarak yeni bir web sitesi hazırlayabiliriz.";

    expect(findForeignWords(text, "tr", ["Hair Design Studio", "Hostlys"])).toEqual(["your"]);
    expect(findForeignWords("Hair Design Studio için bir tasarım hazırlayalım.", "tr", ["Hair Design Studio"])).toEqual([]);
  });

  it("aynı kelimeyi bir kez bildirir ve büyük/küçük harfi ayırmaz", () => {
    expect(findForeignWords("Strengthen etmek, STRENGTHEN etmek.", "tr")).toEqual(["strengthen"]);
  });
});

describe("findForeignWords — İngilizce metinde Türkçe sızıntısı", () => {
  it("Türkçe harfli ve Türkçe işlev kelimelerini yakalar", () => {
    expect(findForeignWords("Hello, we would love to build your website ve ücretsiz bir sample hazırlayalım.", "en")).toEqual([
      "ve",
      "ücretsiz",
      "bir",
      "hazırlayalım",
    ]);
  });

  it("temiz İngilizce metinde bir şey bulmaz", () => {
    expect(findForeignWords("Hello, we build modern websites. Would a free sample design help?", "en")).toEqual([]);
  });

  it("Türkçe harf içeren işletme adı sorun değildir", () => {
    expect(findForeignWords("Hello Güzellik Merkezi team, we build websites.", "en", ["Güzellik Merkezi"])).toEqual([]);
  });
});
