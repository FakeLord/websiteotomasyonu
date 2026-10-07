// "libphonenumber-js" ana paketi küçük ("min") metadata kullanır ve telefon
// TÜRÜNÜ (mobile/fixed-line) ayırt edemez (getType() undefined döner);
// tip tespiti için tam metadata içeren "/max" alt paketi gerekir.
import { parsePhoneNumberFromString, type CountryCode as PhoneCountry } from "libphonenumber-js/max";

export interface NormalizedPhone {
  e164: string;
  isMobile: boolean;
}

/** "+15125550132" → "+1 512 555 0132". Çözülemezse girdiyi olduğu gibi döner. */
export function formatPhoneInternational(e164: string): string {
  try {
    return parsePhoneNumberFromString(e164)?.formatInternational() ?? e164;
  } catch {
    return e164;
  }
}

/**
 * E.164 telefon normalizasyonu (SPEC.md → I.2). `defaultCountry` yalnızca ulusal biçimdeki
 * numaralar için kullanılır (`+` ile başlayanlar ülkeden bağımsızdır); verilmezse eskisi gibi `TR`.
 * Geçersiz/boş girdide veya bilinmeyen ülke kodunda `null` döner.
 */
export function normalizePhone(input: string, defaultCountry: string = "TR"): NormalizedPhone | null {
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;

  let parsed;
  try {
    parsed = parsePhoneNumberFromString(trimmed, defaultCountry.toUpperCase() as PhoneCountry);
  } catch {
    return null;
  }
  if (!parsed || !parsed.isValid()) return null;

  return {
    e164: parsed.number,
    isMobile: parsed.getType() === "MOBILE",
  };
}
