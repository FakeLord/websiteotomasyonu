import { describe, expect, it } from "vitest";
import { geoDefaultsForCountry, resolveRowCountry } from "./business-geo";

describe("geoDefaultsForCountry", () => {
  it("ülkenin varsayılan saat dilimi ve dilini verir", () => {
    expect(geoDefaultsForCountry("US")).toEqual({ countryCode: "US", timezone: "America/New_York", language: "en" });
    expect(geoDefaultsForCountry("TR")).toEqual({ countryCode: "TR", timezone: "Europe/Istanbul", language: "tr" });
  });
  it("koordinat varsa saat dilimi koordinattan gelir", () => {
    expect(geoDefaultsForCountry("US", { lat: 34.05, lng: -118.24 }).timezone).toBe("America/Los_Angeles");
  });
  it("tam profili olmayan ülkede saat dilimi ve dil verilmez", () => {
    expect(geoDefaultsForCountry("DE")).toEqual({ countryCode: "DE" });
  });
});

describe("resolveRowCountry", () => {
  it("CSV'deki geçerli ülke kodunu büyük harfe çevirip kullanır", () => {
    expect(resolveRowCountry("gb", "US")).toBe("GB");
    expect(resolveRowCountry(" CA ", "US")).toBe("CA");
  });
  it("boş veya geçersiz değerde varsayılana düşer", () => {
    expect(resolveRowCountry(undefined, "US")).toBe("US");
    expect(resolveRowCountry("", "US")).toBe("US");
    expect(resolveRowCountry("Turkey", "US")).toBe("US");
  });
});
