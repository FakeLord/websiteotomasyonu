import { normalizeDomain } from "../normalize-domain";
import { normalizePhone } from "../dedupe/normalize-phone";
import { normalizeWebsiteInput } from "../website-analyzer/normalize-url";

export interface BusinessEditSource {
  name: string;
  category: string | null;
  address: string | null;
  city: string | null;
  district: string | null;
  primaryPhoneE164: string | null;
  websiteUrl: string | null;
  countryCode: string;
}

/** Form alanları (hepsi metin; boş = temizle). */
export interface BusinessEditForm {
  name: string;
  category: string;
  address: string;
  city: string;
  district: string;
  phone: string;
  website: string;
}

export type BusinessEditField = keyof BusinessEditForm;
export type BusinessEditError = "NAME_REQUIRED" | "NAME_TOO_LONG" | "INVALID_PHONE" | "INVALID_WEBSITE" | "SOCIAL_AS_WEBSITE";

export interface BusinessPatchResult {
  /** `update_business_details` RPC'sine gidecek yalnızca değişen alanlar (boşaltılan alan `null`). */
  patch: Record<string, string | null>;
  errors: Partial<Record<BusinessEditField, BusinessEditError>>;
  changed: BusinessEditField[];
  /** Site değiştiyse işletme yeniden analiz edilmelidir. */
  websiteChanged: boolean;
}

const MAX_NAME_LENGTH = 200;

const clean = (value: string): string | null => value.trim() || null;

/**
 * Lead düzenleme formunu doğrular ve veritabanına gidecek yamayı üretir: yalnızca değişen alanlar, telefon ülkeye göre
 * E.164, site şemalı adres + alan adı. Hatalı alan yamaya girmez; diğer geçerli alanlar yine hesaplanır.
 */
export function buildBusinessPatch(source: BusinessEditSource, form: BusinessEditForm): BusinessPatchResult {
  const patch: Record<string, string | null> = {};
  const errors: BusinessPatchResult["errors"] = {};
  const changed: BusinessEditField[] = [];
  let websiteChanged = false;

  const name = form.name.trim();
  if (!name) errors.name = "NAME_REQUIRED";
  else if (name.length > MAX_NAME_LENGTH) errors.name = "NAME_TOO_LONG";
  else if (name !== source.name) {
    patch.name = name;
    changed.push("name");
  }

  for (const field of ["category", "address", "city", "district"] as const) {
    const next = clean(form[field]);
    if (next !== (source[field] ?? null)) {
      patch[field] = next;
      changed.push(field);
    }
  }

  const rawPhone = form.phone.trim();
  if (!rawPhone) {
    if (source.primaryPhoneE164) {
      patch.phone = null;
      changed.push("phone");
    }
  } else {
    const normalized = normalizePhone(rawPhone, source.countryCode)?.e164;
    if (!normalized) errors.phone = "INVALID_PHONE";
    else if (normalized !== source.primaryPhoneE164) {
      patch.phone = normalized;
      changed.push("phone");
    }
  }

  const rawWebsite = form.website.trim();
  if (!rawWebsite) {
    if (source.websiteUrl) {
      patch.websiteUrl = null;
      patch.websiteDomain = null;
      changed.push("website");
      websiteChanged = true;
    }
  } else {
    const normalized = normalizeWebsiteInput(rawWebsite);
    if (!normalized) {
      errors.website = isParsableUrl(rawWebsite) ? "SOCIAL_AS_WEBSITE" : "INVALID_WEBSITE";
    } else if (!isValidHost(normalized)) {
      errors.website = "INVALID_WEBSITE";
    } else if (!sameSite(normalized, source.websiteUrl)) {
      patch.websiteUrl = normalized;
      patch.websiteDomain = normalizeDomain(normalized);
      changed.push("website");
      websiteChanged = true;
    }
  }

  return { patch, errors, changed, websiteChanged };
}

function hostOf(url: string): string | null {
  try {
    return new URL(/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(url) ? url : `https://${url}`).hostname;
  } catch {
    return null;
  }
}

function isParsableUrl(value: string): boolean {
  return hostOf(value) !== null && !/\s/.test(value.trim());
}

/** "bu bir site değil" gibi boşluklu veya noktasız (alan adı olamayacak) metni eler. */
function isValidHost(url: string): boolean {
  const host = hostOf(url);
  return host !== null && host.includes(".") && !/\s/.test(url);
}

/** Aynı adres şemasız/www'li/eğik çizgili yazılsa da aynı site sayılır. */
function sameSite(next: string, current: string | null): boolean {
  if (!current) return false;
  const strip = (url: string) => url.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/+$/, "").toLowerCase();
  return strip(next) === strip(current);
}
