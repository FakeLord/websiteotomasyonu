/** Places API (New) `addressComponents` öğesi. */
export interface AddressComponent {
  longText?: string;
  shortText?: string;
  types?: string[];
}

export interface ParsedAddress {
  countryCode: string | null;
  region: string | null;
  city: string | null;
  district: string | null;
  postalCode: string | null;
}

const find = (components: AddressComponent[], type: string): AddressComponent | undefined =>
  components.find((component) => component.types?.includes(type));

const text = (component: AddressComponent | undefined, prefer: "long" | "short" = "long"): string | null => {
  if (!component) return null;
  const value = prefer === "short" ? (component.shortText ?? component.longText) : (component.longText ?? component.shortText);
  return value?.trim() || null;
};

/** Eyalet kısaltması (TX, ON, NSW) kullanılan ülkeler; diğerlerinde uzun ad (England) yazılır. */
const SHORT_REGION_COUNTRIES = new Set(["US", "CA", "AU"]);

/**
 * Places `addressComponents`'ten ülke, bölge, şehir, ilçe ve posta kodunu çıkarır. Ülkeye göre haritalama:
 * Türkiye'de il (`administrative_area_level_1`) şehir, ilçe (`…_2`) ilçedir; diğer ülkelerde şehir `locality`
 * (İngiltere'de `postal_town`) ve bölge birinci düzey idari alandır. Bileşen yoksa her alan `null` döner.
 */
export function parsePlaceAddress(components: AddressComponent[] | undefined): ParsedAddress {
  const list = components ?? [];
  const country = text(find(list, "country"), "short");
  const countryCode = country && /^[A-Za-z]{2}$/.test(country) ? country.toUpperCase() : null;
  const admin1 = find(list, "administrative_area_level_1");
  const postalCode = text(find(list, "postal_code"));

  if (countryCode === "TR") {
    return {
      countryCode,
      region: null,
      city: text(admin1),
      district: text(find(list, "administrative_area_level_2")),
      postalCode,
    };
  }

  const city =
    text(find(list, "locality")) ??
    text(find(list, "postal_town")) ??
    text(find(list, "sublocality_level_1")) ??
    text(find(list, "administrative_area_level_3"));
  const district = text(find(list, "sublocality_level_1")) ?? text(find(list, "sublocality"));

  return {
    countryCode,
    region: text(admin1, countryCode && SHORT_REGION_COUNTRIES.has(countryCode) ? "short" : "long"),
    city,
    district: district && district !== city ? district : null,
    postalCode,
  };
}
