import { getCountryProfile, resolveTimezone } from "@lbf/core";

export interface BusinessGeoDefaults {
  countryCode: string;
  timezone?: string;
  language?: string;
}

/** Elle/CSV ile eklenen işletmenin saat dilimi ve dili (koordinat varsa saat dilimi ondan). */
export function geoDefaultsForCountry(countryCode: string, coords?: { lat: number; lng: number }): BusinessGeoDefaults {
  const code = countryCode.toUpperCase();
  const profile = getCountryProfile(code);
  const timezone = resolveTimezone({ countryCode: code, lat: coords?.lat, lng: coords?.lng });
  return {
    countryCode: code,
    ...(timezone ? { timezone } : {}),
    ...(profile.defaultLanguage ? { language: profile.defaultLanguage } : {}),
  };
}

/** CSV satırındaki `country` değeri geçerli bir ISO kodu ise o, değilse varsayılan ülke. */
export function resolveRowCountry(value: string | undefined, fallback: string): string {
  const candidate = (value ?? "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(candidate) ? candidate : fallback;
}
