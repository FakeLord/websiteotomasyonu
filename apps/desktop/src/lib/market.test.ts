import { describe, expect, it } from "vitest";
import {
  ALL_MARKETS,
  marketCities,
  marketCountries,
  marketRpcParams,
  migratePersistedUiState,
  normalizeMarket,
  type MarketOption,
} from "./market";

const options: MarketOption[] = [
  { country: "US", city: "Austin", count: 5 },
  { country: "US", city: "Dallas", count: 3 },
  { country: "US", city: null, count: 1 },
  { country: "GB", city: "London", count: 4 },
  { country: "TR", city: "İstanbul", count: 10 },
];

describe("marketRpcParams", () => {
  it("tüm pazarlarda iki parametre de null", () => {
    expect(marketRpcParams(ALL_MARKETS)).toEqual({ p_country: null, p_city: null });
  });
  it("ülke ve şehri RPC parametrelerine çevirir", () => {
    expect(marketRpcParams({ country: "US", city: "" })).toEqual({ p_country: "US", p_city: null });
    expect(marketRpcParams({ country: "US", city: "Austin" })).toEqual({ p_country: "US", p_city: "Austin" });
  });
  it("ülkesiz şehir yok sayılır", () => {
    expect(marketRpcParams({ country: "", city: "Austin" })).toEqual({ p_country: null, p_city: null });
  });
});

describe("normalizeMarket", () => {
  it("ülke yoksa şehri de temizler", () => {
    expect(normalizeMarket({ country: "", city: "Austin" })).toEqual(ALL_MARKETS);
  });
  it("ülke küçük harfle gelirse büyütür", () => {
    expect(normalizeMarket({ country: "us", city: "Austin" })).toEqual({ country: "US", city: "Austin" });
  });
});

describe("marketCountries / marketCities", () => {
  it("ülkeleri toplam adede göre sıralar", () => {
    expect(marketCountries(options)).toEqual([
      { code: "TR", count: 10 },
      { code: "US", count: 9 },
      { code: "GB", count: 4 },
    ]);
  });
  it("seçili ülkenin şehirlerini adede göre verir, şehri boş olanları atlar", () => {
    expect(marketCities(options, "US")).toEqual([
      { city: "Austin", count: 5 },
      { city: "Dallas", count: 3 },
    ]);
    expect(marketCities(options, "")).toEqual([]);
  });
});

describe("migratePersistedUiState", () => {
  it("eski {city} kaydını tüm pazarlara çevirir", () => {
    expect(migratePersistedUiState({ city: "İstanbul" })).toEqual({ market: ALL_MARKETS });
  });
  it("yeni biçimi korur ve doğrular", () => {
    expect(migratePersistedUiState({ market: { country: "gb", city: "London" } })).toEqual({
      market: { country: "GB", city: "London" },
    });
  });
  it("bozuk veriyi tüm pazarlara düşürür", () => {
    expect(migratePersistedUiState(null)).toEqual({ market: ALL_MARKETS });
    expect(migratePersistedUiState("x")).toEqual({ market: ALL_MARKETS });
  });
});
