// "libphonenumber-js" ana paketi küçük ("min") metadata kullanır ve telefon
// TÜRÜNÜ (mobile/fixed-line) ayırt edemez (getType() undefined döner);
// tip tespiti için tam metadata içeren "/max" alt paketi gerekir.
import { parsePhoneNumberFromString } from "libphonenumber-js/max";

export interface NormalizedPhone {
  e164: string;
  isMobile: boolean;
}

/**
 * TR varsayılı E.164 telefon normalizasyonu (SPEC.md → I.2). Geçersiz veya
 * boş girdide `null` döner.
 */
export function normalizePhone(input: string, defaultCountry: "TR" = "TR"): NormalizedPhone | null {
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;

  const parsed = parsePhoneNumberFromString(trimmed, defaultCountry);
  if (!parsed || !parsed.isValid()) return null;

  return {
    e164: parsed.number,
    isMobile: parsed.getType() === "MOBILE",
  };
}
