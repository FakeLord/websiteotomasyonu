import { normalizeDomain } from "../normalize-domain";
import { normalizePhone } from "../dedupe/normalize-phone";
import { normalizeSocial } from "../dedupe/normalize-social";

export interface GooglePlaceResult {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  businessStatus?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  rating?: number;
  userRatingCount?: number;
  googleMapsUri?: string;
}

export interface PlaceToBusinessPayload {
  name: string;
  category?: string | undefined;
  address?: string | undefined;
  city?: string | undefined;
  district?: string | undefined;
  lat?: number | undefined;
  lng?: number | undefined;
  rating?: number | undefined;
  reviewCount?: number | undefined;
  googlePlaceId: string;
  websiteUrl?: string | undefined;
  websiteDomain?: string | undefined;
  phoneE164?: string | undefined;
  instagram?: string | undefined;
  facebook?: string | undefined;
  source: "GOOGLE_PLACES";
  externalId: string;
  sourceUrl?: string | undefined;
  businessStatus?: "OPERATIONAL" | "CLOSED_TEMPORARILY" | "CLOSED_PERMANENTLY" | undefined;
}

const SOCIAL_HOSTS: Array<{ platform: "INSTAGRAM" | "FACEBOOK"; hosts: string[] }> = [
  { platform: "INSTAGRAM", hosts: ["instagram.com"] },
  { platform: "FACEBOOK", hosts: ["facebook.com", "fb.com"] },
];
const LINK_IN_BIO_HOSTS = ["linktr.ee", "bio.link", "linkin.bio"];
const ADDRESS_SUFFIX = /\b\d{5}\s+(?:[^,/]+\/)*([^,/]+?)\s*\/\s*([^,/]+?)\s*(?:,\s*T[üu]rkiye)?\s*$/iu;

/** Türkçe büyük/küçük harf kurallarıyla her kelimenin ilk harfini büyütür ("istanbul" → "İstanbul"). */
export function titleCaseTr(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("tr-TR")
    .split(/\s+/)
    .map((word) => (word ? word.charAt(0).toLocaleUpperCase("tr-TR") + word.slice(1) : word))
    .join(" ");
}

/**
 * Google'ın Türkiye adres biçimindeki "… 34710 Kadıköy/İstanbul[, Türkiye]"
 * sonekinden ilçe ve şehri çıkarır.
 */
export function parseTurkishAddress(address: string | undefined): { district: string | null; city: string | null } {
  if (!address) return { district: null, city: null };
  const match = ADDRESS_SUFFIX.exec(address);
  if (!match?.[1] || !match[2]) return { district: null, city: null };
  return { district: match[1].trim(), city: match[2].trim() };
}

/**
 * Places sonucunu `import_business()` RPC payload'ına çevirir (SPEC.md → G.1).
 * `websiteUri` Instagram/Facebook/link-in-bio ise site yok sayılır ve o URL
 * sosyal kanal olarak döner (`NO_WEBSITE` sınıflandırması Faz 4'te uygulanır).
 */
export function placeToBusinessPayload(
  place: GooglePlaceResult,
  context: { city?: string; district?: string; category?: string } = {},
): PlaceToBusinessPayload {
  // Adres, kullanıcının aramaya yazdığı (çoğu zaman küçük harfli, ilçesiz)
  // bağlamdan daha güvenilir; yoksa bağlam Türkçe title-case ile kullanılır.
  const parsed = parseTurkishAddress(place.formattedAddress);
  const city = parsed.city ?? (context.city?.trim() ? titleCaseTr(context.city) : undefined);
  const district = parsed.district ?? (context.district?.trim() ? titleCaseTr(context.district) : undefined);
  const category = context.category?.trim() || undefined;
  const name = place.displayName?.text?.trim() || "Bilinmeyen İşletme";
  const phone = place.internationalPhoneNumber ?? place.nationalPhoneNumber;
  const normalizedPhone = phone ? normalizePhone(phone)?.e164 : undefined;

  let websiteUrl: string | undefined;
  let websiteDomain: string | undefined;
  let instagram: string | undefined;
  let facebook: string | undefined;

  if (place.websiteUri) {
    const domain = normalizeDomain(place.websiteUri);
    const socialMatch = SOCIAL_HOSTS.find((s) => s.hosts.includes(domain));
    const isLinkInBio = LINK_IN_BIO_HOSTS.includes(domain);

    if (socialMatch) {
      const handle = normalizeSocial(place.websiteUri, socialMatch.platform);
      if (socialMatch.platform === "INSTAGRAM") instagram = handle ?? undefined;
      if (socialMatch.platform === "FACEBOOK") facebook = handle ?? undefined;
    } else if (!isLinkInBio) {
      websiteUrl = place.websiteUri;
      websiteDomain = domain || undefined;
    }
  }

  const businessStatus =
    place.businessStatus === "OPERATIONAL" ||
    place.businessStatus === "CLOSED_TEMPORARILY" ||
    place.businessStatus === "CLOSED_PERMANENTLY"
      ? place.businessStatus
      : undefined;

  return {
    name,
    category,
    address: place.formattedAddress,
    city,
    district,
    lat: place.location?.latitude,
    lng: place.location?.longitude,
    rating: place.rating,
    reviewCount: place.userRatingCount,
    googlePlaceId: place.id,
    websiteUrl,
    websiteDomain,
    phoneE164: normalizedPhone,
    instagram,
    facebook,
    source: "GOOGLE_PLACES",
    externalId: place.id,
    sourceUrl: place.googleMapsUri,
    businessStatus,
  };
}
