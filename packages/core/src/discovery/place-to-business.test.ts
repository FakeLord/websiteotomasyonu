import { describe, expect, it } from "vitest";
import { parseTurkishAddress, placeToBusinessPayload, titleCaseTr } from "./place-to-business";

describe("placeToBusinessPayload", () => {
  it("maps a normal website correctly", () => {
    const payload = placeToBusinessPayload(
      {
        id: "place-1",
        displayName: { text: "ABC Diş Kliniği" },
        formattedAddress: "Kadıköy, İstanbul",
        websiteUri: "https://abcdis.com",
        internationalPhoneNumber: "+90 532 123 45 67",
        businessStatus: "OPERATIONAL",
      },
      { city: "İstanbul", district: "Kadıköy" },
    );

    expect(payload.websiteDomain).toBe("abcdis.com");
    expect(payload.websiteUrl).toBe("https://abcdis.com");
    expect(payload.phoneE164).toBe("+905321234567");
    expect(payload.googlePlaceId).toBe("place-1");
    expect(payload.businessStatus).toBe("OPERATIONAL");
  });

  it("treats an Instagram websiteUri as a social channel, not a website", () => {
    const payload = placeToBusinessPayload({
      id: "place-2",
      displayName: { text: "XYZ Kuaför" },
      websiteUri: "https://www.instagram.com/xyz_kuafor/",
    });

    expect(payload.websiteUrl).toBeUndefined();
    expect(payload.websiteDomain).toBeUndefined();
    expect(payload.instagram).toBe("instagram:xyz_kuafor");
  });

  it("treats a link-in-bio URL as no website", () => {
    const payload = placeToBusinessPayload({
      id: "place-3",
      displayName: { text: "Test" },
      websiteUri: "https://linktr.ee/test",
    });

    expect(payload.websiteUrl).toBeUndefined();
    expect(payload.instagram).toBeUndefined();
    expect(payload.facebook).toBeUndefined();
  });

  it("falls back to a placeholder name when displayName is missing", () => {
    const payload = placeToBusinessPayload({ id: "place-4" });
    expect(payload.name).toBe("Bilinmeyen İşletme");
  });

  it("takes district and city from the Turkish formatted address over the typed search context", () => {
    const payload = placeToBusinessPayload(
      {
        id: "place-5",
        displayName: { text: "Agora Diş" },
        formattedAddress: "Zafer mah Doğan Araslı Bulvarı No:93 D:156, Agora Suites, Zafer, 34513 Esenyurt/İstanbul",
      },
      { city: "istanbul" },
    );
    expect(payload.district).toBe("Esenyurt");
    expect(payload.city).toBe("İstanbul");
  });

  it("falls back to the search context when the address has no district/city suffix", () => {
    const payload = placeToBusinessPayload(
      { id: "place-6", displayName: { text: "X" }, formattedAddress: "Bir yer, Türkiye" },
      { city: "istanbul", district: "kadıköy" },
    );
    expect(payload.city).toBe("İstanbul");
    expect(payload.district).toBe("Kadıköy");
  });

  it("carries Google rating and review count onto the payload", () => {
    const payload = placeToBusinessPayload({ id: "place-8", displayName: { text: "X" }, rating: 4.8, userRatingCount: 124 });
    expect(payload.rating).toBe(4.8);
    expect(payload.reviewCount).toBe(124);
  });

  it("carries the searched category onto the payload", () => {
    const payload = placeToBusinessPayload({ id: "place-7", displayName: { text: "X" } }, { category: "Diş Kliniği" });
    expect(payload.category).toBe("Diş Kliniği");
  });
});

describe("parseTurkishAddress", () => {
  it("parses '<postcode> <District>/<City>' at the end of the address", () => {
    expect(parseTurkishAddress("Caferağa, Moda Cd. No:5, 34710 Kadıköy/İstanbul")).toEqual({
      district: "Kadıköy",
      city: "İstanbul",
    });
    expect(parseTurkishAddress("Atatürk Cd. 12, 06420 Çankaya/Ankara, Türkiye")).toEqual({
      district: "Çankaya",
      city: "Ankara",
    });
  });

  it("uses the last two segments when the suffix has extra slash-separated parts", () => {
    expect(parseTurkishAddress("Hürriyet Blv., 34520 Beylikdüzü Osb/Beylikdüzü/İstanbul")).toEqual({
      district: "Beylikdüzü",
      city: "İstanbul",
    });
  });

  it("returns nulls when the pattern is missing", () => {
    expect(parseTurkishAddress("Bir yer")).toEqual({ district: null, city: null });
    expect(parseTurkishAddress(undefined)).toEqual({ district: null, city: null });
  });
});

describe("titleCaseTr", () => {
  it("title-cases with Turkish casing rules", () => {
    expect(titleCaseTr("istanbul")).toBe("İstanbul");
    expect(titleCaseTr("ıspartakule")).toBe("Ispartakule");
    expect(titleCaseTr("beylikdüzü merkez")).toBe("Beylikdüzü Merkez");
  });
});
