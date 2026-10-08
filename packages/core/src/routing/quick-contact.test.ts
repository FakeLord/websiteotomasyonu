import { describe, expect, it } from "vitest";
import { googleMapsUrl, quickContactTarget, type QuickContactChannel } from "./quick-contact";

const ch = (channel: string, normalizedValue: string, extra: Partial<QuickContactChannel> = {}): QuickContactChannel => ({
  channel,
  value: normalizedValue,
  normalizedValue,
  status: "UNVERIFIED",
  ...extra,
});

describe("quickContactTarget", () => {
  it("sosyal medya varsa önce onu açar (Instagram, sonra Facebook)", () => {
    const channels = [ch("EMAIL", "info@a.com"), ch("FACEBOOK", "facebook:sayfa"), ch("INSTAGRAM", "instagram:isletme")];

    expect(quickContactTarget(channels, "+905321112233")).toEqual({ channel: "INSTAGRAM", url: "https://instagram.com/isletme" });
    expect(quickContactTarget(channels.slice(0, 2), null)).toEqual({ channel: "FACEBOOK", url: "https://facebook.com/sayfa" });
  });

  it("sosyal medya yoksa e-posta açar", () => {
    expect(quickContactTarget([ch("PHONE", "+905321112233"), ch("EMAIL", "info@a.com")], "+905321112233")).toEqual({
      channel: "EMAIL",
      url: "mailto:info@a.com",
    });
  });

  it("e-posta da yoksa kayıtlı telefona WhatsApp'tan yazar", () => {
    expect(quickContactTarget([ch("PHONE", "+90 532 111 22 33")], null)).toEqual({
      channel: "WHATSAPP",
      url: "https://wa.me/905321112233",
    });
  });

  it("kanal kaydı yoksa işletmenin ana telefonunu kullanır", () => {
    expect(quickContactTarget([], "+15125550100")).toEqual({ channel: "WHATSAPP", url: "https://wa.me/15125550100" });
  });

  it("kayıtlı WhatsApp numarası telefondan önce gelir", () => {
    expect(quickContactTarget([ch("PHONE", "+905321112233"), ch("WHATSAPP", "+905559998877")], null)?.url).toBe(
      "https://wa.me/905559998877",
    );
  });

  it("geçersiz veya sektirmiş kanalı atlar", () => {
    const channels = [ch("INSTAGRAM", "instagram:eski", { status: "INVALID" }), ch("EMAIL", "x@a.com", { status: "BOUNCED" })];

    expect(quickContactTarget(channels, "+905321112233")?.channel).toBe("WHATSAPP");
  });

  it("LinkedIn tam adres olarak kayıtlıysa onu kullanır", () => {
    expect(quickContactTarget([ch("LINKEDIN", "linkedin:acme", { value: "https://www.linkedin.com/in/acme" })], null)?.url).toBe(
      "https://www.linkedin.com/in/acme",
    );
  });

  it("hiçbir kanal yoksa null döner", () => {
    expect(quickContactTarget([], null)).toBeNull();
    expect(quickContactTarget([ch("WEBSITE_FORM", "https://a.com/iletisim")], "  ")).toBeNull();
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
