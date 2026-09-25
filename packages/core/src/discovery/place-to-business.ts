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
  address?: string | undefined;
  city?: string | undefined;
  district?: string | undefined;
  lat?: number | undefined;
  lng?: number | undefined;
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

/**
 * Places sonucunu `import_business()` RPC payload'ına çevirir (SPEC.md → G.1).
 * `websiteUri` Instagram/Facebook/link-in-bio ise site yok sayılır ve o URL
 * sosyal kanal olarak döner (`NO_WEBSITE` sınıflandırması Faz 4'te uygulanır).
 */
export function placeToBusinessPayload(
  place: GooglePlaceResult,
  context: { city?: string; district?: string } = {},
): PlaceToBusinessPayload {
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
    address: place.formattedAddress,
    city: context.city,
    district: context.district,
    lat: place.location?.latitude,
    lng: place.location?.longitude,
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
