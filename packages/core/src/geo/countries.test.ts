import { describe, expect, it } from "vitest";
import { countryFlag, getCountryProfile, isCountryCode, SUPPORTED_COUNTRY_CODES } from "./countries";

describe("getCountryProfile", () => {
  it("ilk pazarlar için tam profil verir", () => {
    expect(SUPPORTED_COUNTRY_CODES).toEqual(["US", "GB", "CA", "AU", "TR"]);
    const us = getCountryProfile("US");
    expect(us).toMatchObject({ code: "US", nameTr: "Amerika Birleşik Devletleri", currency: "USD", defaultLanguage: "en", phoneCode: "1", supported: true });
    expect(getCountryProfile("GB")).toMatchObject({ currency: "GBP", phoneCode: "44", defaultTimezone: "Europe/London" });
    expect(getCountryProfile("CA")).toMatchObject({ currency: "CAD", languages: ["en", "fr"] });
    expect(getCountryProfile("AU")).toMatchObject({ currency: "AUD", phoneCode: "61" });
    expect(getCountryProfile("TR")).toMatchObject({ nameTr: "Türkiye", currency: "TRY", defaultLanguage: "tr", defaultTimezone: "Europe/Istanbul" });
  });

  it("hafta sonu ISO gün numarasıyla verilir (Cumartesi=6, Pazar=7)", () => {
    expect(getCountryProfile("US").weekendDays).toEqual([6, 7]);
  });

  it("desteklenmeyen ülke için genel profil üretir: Türkçe ad, telefon kodu, para birimi yok", () => {
    const de = getCountryProfile("DE");
    expect(de.supported).toBe(false);
    expect(de.nameTr).toBe("Almanya");
    expect(de.phoneCode).toBe("49");
    expect(de.currency).toBeNull();
    expect(de.defaultTimezone).toBeNull();
  });

  it("küçük harfli kodu da kabul eder", () => {
    expect(getCountryProfile("us").code).toBe("US");
  });
});

describe("isCountryCode / countryFlag", () => {
  it("yalnızca iki büyük harfi geçerli sayar", () => {
    expect(isCountryCode("US")).toBe(true);
    expect(isCountryCode("us")).toBe(false);
    expect(isCountryCode("USA")).toBe(false);
    expect(isCountryCode("")).toBe(false);
  });

  it("bayrak emojisini bölgesel gösterge harflerinden üretir", () => {
    expect(countryFlag("TR")).toBe("🇹🇷");
    expect(countryFlag("US")).toBe("🇺🇸");
    expect(countryFlag("zz-")).toBe("");
  });
});
