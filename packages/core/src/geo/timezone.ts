import tzlookup from "@photostructure/tz-lookup";
import { getCountryProfile, type CountryCode } from "./countries";

export interface TimezoneInput {
  lat?: number | null | undefined;
  lng?: number | null | undefined;
  countryCode: CountryCode;
}

/**
 * İşletmenin IANA saat dilimi. ABD/Kanada/Avustralya birden çok dilimli olduğu için önce
 * enlem/boylamdan bulunur; koordinat yoksa veya geçersizse ülkenin varsayılan dilimine, o da
 * yoksa `null`'a düşer (çağıran çalışma alanı saatini kullanır).
 */
export function resolveTimezone(input: TimezoneInput): string | null {
  const { lat, lng } = input;
  if (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
  ) {
    try {
      return tzlookup(lat, lng);
    } catch {
      // aşağıdaki yedeğe düş
    }
  }
  return getCountryProfile(input.countryCode).defaultTimezone;
}
