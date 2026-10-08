import { describe, expect, it } from "vitest";
import {
  DISCOVER_CATEGORIES,
  DISCOVER_MARKETS,
  canonicalCategory,
  categoryQueryTerm,
  cityBoundsQuery,
  discoverCityCenter,
  discoverMarket,
  discoverTextQuery,
  scanCategories,
} from "./discover-markets";

describe("DISCOVER_MARKETS", () => {
  it("beş ilk pazarı kapsar ve her şehrin koordinatı geçerlidir", () => {
    expect(DISCOVER_MARKETS.map((m) => m.countryCode)).toEqual(["US", "GB", "CA", "AU", "TR"]);
    for (const market of DISCOVER_MARKETS) {
      expect(market.cities.length).toBeGreaterThanOrEqual(6);
      for (const city of market.cities) {
        expect(Math.abs(city.lat)).toBeLessThanOrEqual(90);
        expect(Math.abs(city.lng)).toBeLessThanOrEqual(180);
      }
    }
  });
  it("Türkiye listesi eski 18 ili korur", () => {
    expect(discoverMarket("TR")?.cities.map((c) => c.name)).toContain("İstanbul");
    expect(discoverMarket("TR")?.cities.length).toBe(18);
  });
});

describe("discoverCityCenter", () => {
  it("bilinen şehrin merkezini verir (büyük/küçük harf ve aksan duyarsız)", () => {
    expect(discoverCityCenter("US", "Austin")).toMatchObject({ lat: expect.closeTo(30.27, 1), lng: expect.closeTo(-97.74, 1) });
    expect(discoverCityCenter("US", "austin")).not.toBeNull();
    expect(discoverCityCenter("CA", "Montreal")).not.toBeNull();
  });
  it("bilinmeyen şehirde null döner", () => {
    expect(discoverCityCenter("US", "Atlantis")).toBeNull();
    expect(discoverCityCenter("ZZ", "Austin")).toBeNull();
  });
});

describe("categoryQueryTerm / discoverTextQuery", () => {
  const dentist = DISCOVER_CATEGORIES[0]!;
  it("Türkiye'de Türkçe, diğer pazarlarda İngilizce terimi kullanır", () => {
    expect(dentist.tr).toBe("Diş Kliniği");
    expect(categoryQueryTerm(dentist, "TR")).toBe("Diş Kliniği");
    expect(categoryQueryTerm(dentist, "US")).toBe("Dentist");
  });
  it("Places metin sorgusunu 'kategori anahtar-kelime ilçe şehir' sırasıyla kurar", () => {
    expect(discoverTextQuery({ keyword: "", category: "Dentist", city: "Austin", district: "" })).toBe("Dentist Austin");
    expect(discoverTextQuery({ keyword: "emergency", category: "Dentist", city: "Austin", district: "Downtown" })).toBe(
      "Dentist emergency Downtown Austin",
    );
  });
});

describe("scanCategories", () => {
  it("Türkiye dışında İngilizce sorgu, Türkçe etiket üretir", () => {
    expect(scanCategories(["Berber", "Oto Servis"], "US")).toEqual([
      { label: "Berber", query: "Barber shop" },
      { label: "Oto Servis", query: "Auto repair shop" },
    ]);
  });

  it("Türkiye'de sorgu Türkçedir ve bilinmeyen etiket atlanır", () => {
    expect(scanCategories(["Kafe", "Uydurma"], "tr")).toEqual([{ label: "Kafe", query: "Kafe" }]);
  });
});

describe("cityBoundsQuery", () => {
  it("şehre ülkenin İngilizce adını ekler", () => {
    expect(cityBoundsQuery(" Austin ", "us")).toBe("Austin, United States");
  });
});

describe("canonicalCategory", () => {
  it("İngilizce terimi Türkçe etikete çevirir", () => {
    expect(canonicalCategory("Dentist")).toBe("Diş Kliniği");
    expect(canonicalCategory("auto repair shop")).toBe("Oto Servis");
  });

  it("Türkçe etiketi ve büyük/küçük harf farkını korur", () => {
    expect(canonicalCategory("Diş Kliniği")).toBe("Diş Kliniği");
    expect(canonicalCategory("DİŞ KLİNİĞİ")).toBe("Diş Kliniği");
  });

  it("bilinmeyen kategoriyi olduğu gibi döner", () => {
    expect(canonicalCategory("Halı Yıkama")).toBe("Halı Yıkama");
    expect(canonicalCategory("—")).toBe("—");
  });
});
