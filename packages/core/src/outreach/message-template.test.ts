import { describe, expect, it } from "vitest";
import {
  DEFAULT_MESSAGE_TEMPLATES,
  renderMessageTemplate,
  shortBusinessName,
  templateLanguageFor,
  unknownPlaceholders,
  whatsappUrlWithText,
} from "./message-template";

describe("shortBusinessName", () => {
  it("BÜYÜK HARFLİ adı Başlık Biçimine çevirir; 've' gibi bağlaçlar küçük kalır", () => {
    expect(shortBusinessName("MERSİN OPAK DENT AĞIZ VE DİŞ SAĞLIĞI POLİKLİNİĞİ", "tr")).toBe("Mersin Opak Dent Ağız ve Diş Sağlığı Polikliniği");
  });

  it("Türkçe büyük/küçük harf kurallarını uygular (İ/ı)", () => {
    expect(shortBusinessName("IŞIK DİŞ KLİNİĞİ", "tr")).toBe("Işık Diş Kliniği");
  });

  it("İngilizce büyük harfli adı da düzeltir", () => {
    expect(shortBusinessName("LOPEZ DENTAL CENTER AND SPA", "en")).toBe("Lopez Dental Center and Spa");
  });

  it("zaten düzgün yazılmış adı değiştirmez (marka yazımları korunur)", () => {
    expect(shortBusinessName("DTLA Smile Dental", "en")).toBe("DTLA Smile Dental");
    expect(shortBusinessName("Ecesu Beauty Studio", "tr")).toBe("Ecesu Beauty Studio");
  });

  it("'|' ve ' - ' ile eklenmiş uzun anahtar kelime kuyruğunu atar", () => {
    expect(
      shortBusinessName("Ecesu Beauty Studio | Güzellik Salonu | Cilt Bakımı | Bölgesel İncelme | Lazer Epilasyon | Alibeyköy", "tr"),
    ).toBe("Ecesu Beauty Studio");
    expect(shortBusinessName("Alena Güzellik İstanbul – Kaş, Kirpik, G5 Masaj & Cilt Bakımı", "tr")).toBe("Alena Güzellik İstanbul");
    expect(shortBusinessName("Windy Hair Salon - Best Haircuts in Austin", "en")).toBe("Windy Hair Salon");
  });

  it("tire içeren markayı bölmez (boşluksuz tire adın parçasıdır)", () => {
    expect(shortBusinessName("Coca-Cola Bayii", "tr")).toBe("Coca-Cola Bayii");
  });

  it("çok uzun adı kelime sınırında 50 karaktere kısaltır", () => {
    const long = "Gül Hukuk ve Danışmanlık Bürosu Ceza Avukatı Boşanma Avukatı Gayrimenkul Avukatı";

    const short = shortBusinessName(long, "tr");

    expect(short.length).toBeLessThanOrEqual(50);
    expect(long.startsWith(short)).toBe(true);
    expect(short.endsWith(" ")).toBe(false);
  });

  it("parantez içindeki tekrarı ve sondaki noktalamayı atar (gerçek vaka)", () => {
    expect(shortBusinessName("SABRİYE & UĞUR. BAYAN KUAFÖRÜ. (. SABRİYE & UĞUR )", "tr")).toBe("Sabriye & Uğur. Bayan Kuaförü");
    expect(shortBusinessName("Güzel Saç Salonu (Merkez Şube)", "tr")).toBe("Güzel Saç Salonu");
  });

  it("virgülden sonraki anahtar kelime listesini atar (gerçek vaka)", () => {
    expect(
      shortBusinessName("GAZİOSMANPAŞA PATİ VETERİNER ,GAZİOSMANPAŞA VETERİNER, ACİL VETERİNER KEDİ KÖPEK", "tr"),
    ).toBe("Gaziosmanpaşa Pati Veteriner");
    expect(shortBusinessName("Dr. Ali Yılmaz, Diş Hekimi", "tr")).toBe("Dr. Ali Yılmaz");
  });

  it("kısa bir ilk parçayı virgülde kesmez (adın kendisi olabilir)", () => {
    expect(shortBusinessName("Ali, Veli ve Ortakları Hukuk Bürosu", "tr")).toBe("Ali, Veli ve Ortakları Hukuk Bürosu");
  });

  it("boş adda boş döner", () => {
    expect(shortBusinessName("   ", "tr")).toBe("");
  });
});

describe("renderMessageTemplate", () => {
  it("yer tutucuları doldurur, tekrar edenleri de", () => {
    const text = renderMessageTemplate("Merhaba {isletme} ekibi, {isletme} için örnek hazırladık. — {sirket}", {
      isletme: "Opak Dent",
      sirket: "Hostlys",
    });

    expect(text).toBe("Merhaba Opak Dent ekibi, Opak Dent için örnek hazırladık. — Hostlys");
  });

  it("değeri boş olan yer tutucu temiz silinir (çift boşluk kalmaz)", () => {
    expect(renderMessageTemplate("Biz {sirket}, size yazıyoruz.", { sirket: "" })).toBe("Biz, size yazıyoruz.");
    expect(renderMessageTemplate("Merhaba {kategori} {isletme}", { isletme: "Opak" })).toBe("Merhaba Opak");
  });

  it("bilinmeyen yer tutucuya dokunmaz", () => {
    expect(renderMessageTemplate("Merhaba {isim}", { isletme: "X" })).toBe("Merhaba {isim}");
  });

  it("satır sonlarını korur, baştaki/sondaki boşluğu temizler", () => {
    expect(renderMessageTemplate("  Merhaba {isletme}\n\nGörüşürüz  ", { isletme: "X" })).toBe("Merhaba X\n\nGörüşürüz");
  });

  it("değerdeki süslü parantezler yeniden yorumlanmaz", () => {
    expect(renderMessageTemplate("Merhaba {isletme}", { isletme: "{sirket} Kafe", sirket: "Hostlys" })).toBe("Merhaba {sirket} Kafe");
  });

  it("varsayılan şablonlar yalnızca bilinen yer tutucuları içerir ve makul uzunluktadır", () => {
    for (const language of ["tr", "en"] as const) {
      const template = DEFAULT_MESSAGE_TEMPLATES[language];

      expect(unknownPlaceholders(template)).toEqual([]);
      expect(template.length).toBeGreaterThan(80);
      expect(template.length).toBeLessThan(700);
      expect(template).not.toMatch(/%|indirim|discount|guarantee|garanti/i);
    }
  });
});

describe("unknownPlaceholders", () => {
  it("tanınmayan yer tutucuları (yazım hatalarını) bulur", () => {
    expect(unknownPlaceholders("Merhaba {isletme}, {sirkt} ve {isim} {isletme}")).toEqual(["{sirkt}", "{isim}"]);
  });
});

describe("templateLanguageFor", () => {
  it("Türkiye veya Türkçe işletmeye Türkçe, diğerlerine İngilizce şablon seçer", () => {
    expect(templateLanguageFor({ language: null, countryCode: "TR" })).toBe("tr");
    expect(templateLanguageFor({ language: "tr", countryCode: "DE" })).toBe("tr");
    expect(templateLanguageFor({ language: "en", countryCode: "US" })).toBe("en");
    expect(templateLanguageFor({ language: "de", countryCode: "DE" })).toBe("en");
    expect(templateLanguageFor({ language: null, countryCode: "GB" })).toBe("en");
  });
});

describe("whatsappUrlWithText", () => {
  it("numarayı rakamlara indirir ve mesajı URL'ye güvenle kodlar", () => {
    expect(whatsappUrlWithText("+90 532 111 22 33", "Merhaba & selam?\nTamam")).toBe(
      "https://wa.me/905321112233?text=Merhaba%20%26%20selam%3F%0ATamam",
    );
  });

  it("mesaj boşsa yalnızca sohbeti açar", () => {
    expect(whatsappUrlWithText("+905321112233", "  ")).toBe("https://wa.me/905321112233");
  });

  it("geçersiz (çok kısa) numarada null döner", () => {
    expect(whatsappUrlWithText("12", "Merhaba")).toBeNull();
  });
});
