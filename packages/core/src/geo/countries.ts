import { getCountryCallingCode, type CountryCode as PhoneCountryCode } from "libphonenumber-js/max";

/** ISO-3166-1 alpha-2, büyük harf (DB'deki `country_code` CHECK'iyle aynı kural). */
export type CountryCode = string;

export interface CountryProfile {
  code: CountryCode;
  /** Arayüzde gösterilen Türkçe ad. */
  nameTr: string;
  languages: string[];
  defaultLanguage: string | null;
  /** ISO-4217; profili olmayan ülkede `null` (G5'e kadar e-posta kapalı olur). */
  currency: string | null;
  /** ISO hafta günü: 1=Pazartesi … 7=Pazar. */
  weekendDays: number[];
  phoneCode: string | null;
  /** Koordinat yoksa kullanılacak IANA dilimi; çok dilimli ülkelerde yalnızca en makul tahmin. */
  defaultTimezone: string | null;
  /** İlk pazarlardan biri (tam profil). */
  supported: boolean;
}

interface SupportedSeed {
  nameTr: string;
  languages: string[];
  currency: string;
  phoneCode: string;
  defaultTimezone: string;
}

const SUPPORTED: Record<string, SupportedSeed> = {
  US: { nameTr: "Amerika Birleşik Devletleri", languages: ["en"], currency: "USD", phoneCode: "1", defaultTimezone: "America/New_York" },
  GB: { nameTr: "Birleşik Krallık", languages: ["en"], currency: "GBP", phoneCode: "44", defaultTimezone: "Europe/London" },
  CA: { nameTr: "Kanada", languages: ["en", "fr"], currency: "CAD", phoneCode: "1", defaultTimezone: "America/Toronto" },
  AU: { nameTr: "Avustralya", languages: ["en"], currency: "AUD", phoneCode: "61", defaultTimezone: "Australia/Sydney" },
  TR: { nameTr: "Türkiye", languages: ["tr"], currency: "TRY", phoneCode: "90", defaultTimezone: "Europe/Istanbul" },
};

export const SUPPORTED_COUNTRY_CODES = Object.keys(SUPPORTED) as CountryCode[];

const WEEKEND_SAT_SUN = [6, 7];

export function isCountryCode(value: string): boolean {
  return /^[A-Z]{2}$/.test(value);
}

function displayName(code: string): string {
  try {
    return new Intl.DisplayNames(["tr"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

function callingCode(code: string): string | null {
  try {
    return getCountryCallingCode(code as PhoneCountryCode);
  } catch {
    return null;
  }
}

/**
 * Ülke profili. İlk pazarlar (ABD, İngiltere, Kanada, Avustralya, Türkiye) tam; diğer ülkeler için
 * ad ve telefon kodu kütüphanelerden gelir, para birimi/saat dilimi bilinmez (`null`).
 */
export function getCountryProfile(input: CountryCode): CountryProfile {
  const code = input.toUpperCase();
  const seed = SUPPORTED[code];
  if (seed) {
    return {
      code,
      nameTr: seed.nameTr,
      languages: seed.languages,
      defaultLanguage: seed.languages[0] ?? null,
      currency: seed.currency,
      weekendDays: WEEKEND_SAT_SUN,
      phoneCode: seed.phoneCode,
      defaultTimezone: seed.defaultTimezone,
      supported: true,
    };
  }
  return {
    code,
    nameTr: displayName(code),
    languages: [],
    defaultLanguage: null,
    currency: null,
    weekendDays: WEEKEND_SAT_SUN,
    phoneCode: callingCode(code),
    defaultTimezone: null,
    supported: false,
  };
}

/** Bölgesel gösterge harflerinden bayrak emojisi; geçersiz kodda boş metin. */
export function countryFlag(code: CountryCode): string {
  if (!isCountryCode(code)) return "";
  return String.fromCodePoint(...[...code].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));
}
