import { describe, expect, it } from "vitest";
import { placeToBusinessPayload } from "./place-to-business";

const austin = {
  id: "place-us-1",
  displayName: { text: "Congress Ave Dental" },
  formattedAddress: "1100 Congress Ave, Austin, TX 78701, USA",
  location: { latitude: 30.2747, longitude: -97.7404 },
  nationalPhoneNumber: "(512) 555-0132",
  internationalPhoneNumber: "+1 512-555-0132",
  addressComponents: [
    { longText: "Austin", shortText: "Austin", types: ["locality", "political"] },
    { longText: "Texas", shortText: "TX", types: ["administrative_area_level_1", "political"] },
    { longText: "United States", shortText: "US", types: ["country", "political"] },
    { longText: "78701", shortText: "78701", types: ["postal_code"] },
  ],
};

describe("placeToBusinessPayload — küresel", () => {
  it("ABD kaydında ülke, bölge, şehir, posta kodu, saat dilimi, dil ve E.164 telefonu doldurur", () => {
    const payload = placeToBusinessPayload(austin, { category: "dentist" });
    expect(payload).toMatchObject({
      countryCode: "US",
      region: "TX",
      city: "Austin",
      postalCode: "78701",
      timezone: "America/Chicago",
      language: "en",
      phoneE164: "+15125550132",
    });
  });

  it("ulusal telefonu ülkeye göre çözer (uluslararası biçim yoksa)", () => {
    const { internationalPhoneNumber: _omit, ...nationalOnly } = austin;
    const payload = placeToBusinessPayload(nationalOnly);
    expect(payload.phoneE164).toBe("+15125550132");
  });

  it("adres bileşeni yoksa bağlamdaki ülkeyi kullanır ve şehri Türkçe büyük harfe çevirmez", () => {
    const payload = placeToBusinessPayload(
      { id: "place-gb-1", displayName: { text: "Soho Dental" }, location: { latitude: 51.5136, longitude: -0.1365 } },
      { city: "london", countryCode: "GB" },
    );
    expect(payload).toMatchObject({ countryCode: "GB", city: "london", timezone: "Europe/London", language: "en" });
  });

  it("Türkiye kaydında eski davranış korunur: adres sonekinden ilçe/şehir, TR ülke ve dil", () => {
    const payload = placeToBusinessPayload(
      { id: "place-tr-1", displayName: { text: "Agora Diş" }, formattedAddress: "Zafer, 34513 Esenyurt/İstanbul", location: { latitude: 41.03, longitude: 28.67 } },
      { countryCode: "TR" },
    );
    expect(payload).toMatchObject({ countryCode: "TR", city: "İstanbul", district: "Esenyurt", timezone: "Europe/Istanbul", language: "tr" });
  });

  it("ülke bilinmiyorsa ülke/saat dilimi/dil alanlarını boş bırakır (sunucu varsayılanı kullanır)", () => {
    const payload = placeToBusinessPayload({ id: "p", displayName: { text: "X" } });
    expect(payload.countryCode).toBeUndefined();
    expect(payload.timezone).toBeUndefined();
    expect(payload.language).toBeUndefined();
  });
});
