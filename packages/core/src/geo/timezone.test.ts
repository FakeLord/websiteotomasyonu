import { describe, expect, it } from "vitest";
import { resolveTimezone } from "./timezone";

describe("resolveTimezone", () => {
  it("enlem/boylamdan IANA saat dilimini bulur (çok dilimli ülkeler dahil)", () => {
    expect(resolveTimezone({ lat: 30.2672, lng: -97.7431, countryCode: "US" })).toBe("America/Chicago"); // Austin
    expect(resolveTimezone({ lat: 34.0522, lng: -118.2437, countryCode: "US" })).toBe("America/Los_Angeles");
    expect(resolveTimezone({ lat: 43.6532, lng: -79.3832, countryCode: "CA" })).toBe("America/Toronto");
    expect(resolveTimezone({ lat: -33.8688, lng: 151.2093, countryCode: "AU" })).toBe("Australia/Sydney");
    expect(resolveTimezone({ lat: -31.9505, lng: 115.8605, countryCode: "AU" })).toBe("Australia/Perth");
    expect(resolveTimezone({ lat: 51.5074, lng: -0.1278, countryCode: "GB" })).toBe("Europe/London");
    expect(resolveTimezone({ lat: 41.0082, lng: 28.9784, countryCode: "TR" })).toBe("Europe/Istanbul");
  });

  it("koordinat yoksa ülkenin varsayılan saat dilimine düşer", () => {
    expect(resolveTimezone({ countryCode: "US" })).toBe("America/New_York");
    expect(resolveTimezone({ lat: null, lng: null, countryCode: "TR" })).toBe("Europe/Istanbul");
  });

  it("geçersiz koordinatta da ülke varsayılanına düşer", () => {
    expect(resolveTimezone({ lat: 999, lng: 999, countryCode: "GB" })).toBe("Europe/London");
    expect(resolveTimezone({ lat: Number.NaN, lng: 10, countryCode: "AU" })).toBe("Australia/Sydney");
  });

  it("ne koordinat ne bilinen ülke varsa null döner (çağıran çalışma alanı saatini kullanır)", () => {
    expect(resolveTimezone({ countryCode: "DE" })).toBeNull();
  });
});
