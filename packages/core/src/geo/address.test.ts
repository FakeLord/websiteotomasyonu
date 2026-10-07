import { describe, expect, it } from "vitest";
import { parsePlaceAddress, type AddressComponent } from "./address";

const c = (longText: string, shortText: string, ...types: string[]): AddressComponent => ({ longText, shortText, types });

describe("parsePlaceAddress", () => {
  it("ABD adresinde şehir, eyalet kısaltması ve posta kodunu çıkarır", () => {
    const parsed = parsePlaceAddress([
      c("1100", "1100", "street_number"),
      c("Congress Avenue", "Congress Ave", "route"),
      c("Austin", "Austin", "locality", "political"),
      c("Travis County", "Travis County", "administrative_area_level_2", "political"),
      c("Texas", "TX", "administrative_area_level_1", "political"),
      c("United States", "US", "country", "political"),
      c("78701", "78701", "postal_code"),
    ]);
    expect(parsed).toEqual({ countryCode: "US", region: "TX", city: "Austin", district: null, postalCode: "78701" });
  });

  it("İngiltere'de şehir olarak postal_town'u, bölge olarak uzun adı kullanır", () => {
    const parsed = parsePlaceAddress([
      c("Oxford Street", "Oxford St", "route"),
      c("London", "London", "postal_town"),
      c("Greater London", "Greater London", "administrative_area_level_2", "political"),
      c("England", "England", "administrative_area_level_1", "political"),
      c("United Kingdom", "GB", "country", "political"),
      c("W1D 1BS", "W1D 1BS", "postal_code"),
    ]);
    expect(parsed).toMatchObject({ countryCode: "GB", city: "London", region: "England", postalCode: "W1D 1BS" });
  });

  it("Kanada ve Avustralya'da eyalet kısaltmasını bölge yapar", () => {
    expect(
      parsePlaceAddress([c("Toronto", "Toronto", "locality"), c("Ontario", "ON", "administrative_area_level_1"), c("Canada", "CA", "country")]),
    ).toMatchObject({ countryCode: "CA", city: "Toronto", region: "ON" });
    expect(
      parsePlaceAddress([c("Sydney", "Sydney", "locality"), c("New South Wales", "NSW", "administrative_area_level_1"), c("Australia", "AU", "country")]),
    ).toMatchObject({ countryCode: "AU", city: "Sydney", region: "NSW" });
  });

  it("Türkiye'de il şehir, ilçe ilçe olur; bölge boş kalır", () => {
    const parsed = parsePlaceAddress([
      c("İstanbul", "İstanbul", "administrative_area_level_1", "political"),
      c("Kadıköy", "Kadıköy", "administrative_area_level_2", "political"),
      c("Türkiye", "TR", "country", "political"),
      c("34710", "34710", "postal_code"),
    ]);
    expect(parsed).toEqual({ countryCode: "TR", region: null, city: "İstanbul", district: "Kadıköy", postalCode: "34710" });
  });

  it("bileşen yoksa her alan null döner", () => {
    expect(parsePlaceAddress(undefined)).toEqual({ countryCode: null, region: null, city: null, district: null, postalCode: null });
    expect(parsePlaceAddress([])).toEqual({ countryCode: null, region: null, city: null, district: null, postalCode: null });
  });
});
