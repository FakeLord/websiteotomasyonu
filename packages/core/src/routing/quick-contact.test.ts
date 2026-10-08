import { describe, expect, it } from "vitest";
import { contactOptions, googleMapsUrl, type QuickContactChannel } from "./quick-contact";

const ch = (channel: string, normalizedValue: string, extra: Partial<QuickContactChannel> = {}): QuickContactChannel => ({
  channel,
  value: normalizedValue,
  normalizedValue,
  status: "UNVERIFIED",
  ...extra,
});

const kinds = (channels: QuickContactChannel[], phone: string | null = null) => contactOptions(channels, phone).map((o) => o.channel);

describe("contactOptions", () => {
  it("bütün kanalları listeler: önce e-posta ve WhatsApp, sonra sosyal medya, en sonda arama", () => {
    const options = contactOptions(
      [ch("INSTAGRAM", "instagram:isletme"), ch("PHONE", "+905321112233"), ch("FACEBOOK", "facebook:sayfa"), ch("EMAIL", "info@a.com")],
      "+905321112233",
    );

    expect(options).toEqual([
      { channel: "EMAIL", display: "info@a.com", url: "mailto:info@a.com" },
      { channel: "WHATSAPP", display: "+905321112233", url: "https://wa.me/905321112233" },
      { channel: "INSTAGRAM", display: "@isletme", url: "https://instagram.com/isletme" },
      { channel: "FACEBOOK", display: "@sayfa", url: "https://facebook.com/sayfa" },
      { channel: "PHONE", display: "+905321112233", url: "tel:+905321112233" },
    ]);
  });

  it("sabit hatta WhatsApp seçeneği çıkmaz, yalnızca arama çıkar", () => {
    expect(kinds([ch("PHONE", "+493601856553")], "+493601856553")).toEqual(["PHONE"]);
  });

  it("türü bilinmeyen numarada (ABD) WhatsApp önermez", () => {
    expect(kinds([], "+15125550132")).toEqual(["PHONE"]);
  });

  it("kayıtlı WhatsApp kanalı ile aynı cep numarası tek seçenek olur", () => {
    const options = contactOptions([ch("WHATSAPP", "+905321112233"), ch("PHONE", "+905321112233")], "+905321112233");

    expect(options.map((o) => o.url)).toEqual(["https://wa.me/905321112233", "tel:+905321112233"]);
  });

  it("aynı kanaldan birden çok adres varsa hepsini verir", () => {
    const options = contactOptions([ch("EMAIL", "info@a.com"), ch("EMAIL", "randevu@a.com")], null);

    expect(options.map((o) => o.display)).toEqual(["info@a.com", "randevu@a.com"]);
  });

  it("geçersiz veya geri dönmüş kanalı atlar", () => {
    const channels = [ch("INSTAGRAM", "instagram:eski", { status: "INVALID" }), ch("EMAIL", "x@a.com", { status: "BOUNCED" })];

    expect(kinds(channels, "+905321112233")).toEqual(["WHATSAPP", "PHONE"]);
  });

  it("LinkedIn tam adres olarak kayıtlıysa onu kullanır; TikTok adındaki @ tekrarlanmaz", () => {
    const options = contactOptions(
      [ch("LINKEDIN", "linkedin:acme", { value: "https://www.linkedin.com/in/acme" }), ch("TIKTOK", "tiktok:@acme")],
      null,
    );

    expect(options.map((o) => o.url)).toEqual(["https://www.linkedin.com/in/acme", "https://tiktok.com/@acme"]);
  });

  it("hiçbir kanal yoksa boş liste döner", () => {
    expect(contactOptions([], null)).toEqual([]);
    expect(contactOptions([ch("WEBSITE_FORM", "https://a.com/iletisim")], "  ")).toEqual([]);
  });
});

describe("googleMapsUrl", () => {
  it("place_id varsa işletmenin kendi Maps sayfasını açar", () => {
    const url = googleMapsUrl({ name: "Windy Hair & Co", address: "12 Main St, Austin", googlePlaceId: "ChIJabc" });

    expect(url).toBe("https://www.google.com/maps/search/?api=1&query=Windy%20Hair%20%26%20Co%2C%2012%20Main%20St%2C%20Austin&query_place_id=ChIJabc");
  });

  it("place_id yoksa ad ve adresle arar", () => {
    expect(googleMapsUrl({ name: "Kafe Ada", address: null, city: "İzmir", googlePlaceId: null })).toBe(
      "https://www.google.com/maps/search/?api=1&query=Kafe%20Ada%2C%20%C4%B0zmir",
    );
  });
});
