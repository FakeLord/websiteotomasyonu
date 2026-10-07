/** Üst çubuktaki pazar filtresi (ülke → şehir). Boş metin "hepsi" demektir. */
export interface Market {
  country: string;
  city: string;
}

export const ALL_MARKETS: Market = { country: "", city: "" };

/** `market_options` RPC satırı. */
export interface MarketOption {
  country: string;
  city: string | null;
  count: number;
}

/** Ülke yoksa şehir anlamsızdır; ülke kodu büyük harfe çevrilir. */
export function normalizeMarket(market: Market): Market {
  const country = market.country.trim().toUpperCase();
  if (!country) return ALL_MARKETS;
  return { country, city: market.city.trim() };
}

/** RPC'lerin `p_country`/`p_city` parametreleri (null = süzme yok). */
export function marketRpcParams(market: Market): { p_country: string | null; p_city: string | null } {
  const m = normalizeMarket(market);
  return { p_country: m.country || null, p_city: m.city || null };
}

export function marketCountries(options: MarketOption[]): Array<{ code: string; count: number }> {
  const totals = new Map<string, number>();
  for (const option of options) totals.set(option.country, (totals.get(option.country) ?? 0) + option.count);
  return [...totals.entries()].map(([code, count]) => ({ code, count })).sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));
}

export function marketCities(options: MarketOption[], country: string): Array<{ city: string; count: number }> {
  if (!country) return [];
  return options
    .filter((option) => option.country === country && option.city)
    .map((option) => ({ city: option.city as string, count: option.count }))
    .sort((a, b) => b.count - a.count || a.city.localeCompare(b.city));
}

/** localStorage'daki eski `{city}` (Türkiye'ye sabit şehir seçimi) kaydını yeni pazar biçimine taşır. */
export function migratePersistedUiState(persisted: unknown): { market: Market } {
  if (typeof persisted === "object" && persisted !== null && "market" in persisted) {
    const market = (persisted as { market: unknown }).market;
    if (typeof market === "object" && market !== null) {
      const { country, city } = market as { country?: unknown; city?: unknown };
      if (typeof country === "string" && typeof city === "string") return { market: normalizeMarket({ country, city }) };
    }
  }
  return { market: ALL_MARKETS };
}
