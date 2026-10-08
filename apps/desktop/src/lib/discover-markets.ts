import { CITY_CENTERS, TURKEY_CENTER, type LatLng } from "./geo";

export interface DiscoverCity {
  name: string;
  lat: number;
  lng: number;
}

export interface DiscoverMarket {
  countryCode: string;
  /** Ülke seçilince haritanın ilk konumu. */
  center: LatLng;
  cities: DiscoverCity[];
}

const city = (name: string, lat: number, lng: number): DiscoverCity => ({ name, lat, lng });

const TURKEY_CITIES: DiscoverCity[] = Object.entries(CITY_CENTERS).map(([name, c]) => city(name, c.lat, c.lng));

/** İlk pazarlar için seçilmiş şehirler (G3'te tam alan seçici gelir); başka şehir elle yazılabilir. */
export const DISCOVER_MARKETS: DiscoverMarket[] = [
  {
    countryCode: "US",
    center: { lat: 39.5, lng: -98.35 },
    cities: [
      city("Austin", 30.2672, -97.7431),
      city("New York", 40.7128, -74.006),
      city("Los Angeles", 34.0522, -118.2437),
      city("Chicago", 41.8781, -87.6298),
      city("Houston", 29.7604, -95.3698),
      city("Dallas", 32.7767, -96.797),
      city("Miami", 25.7617, -80.1918),
      city("Seattle", 47.6062, -122.3321),
      city("San Francisco", 37.7749, -122.4194),
      city("Boston", 42.3601, -71.0589),
    ],
  },
  {
    countryCode: "GB",
    center: { lat: 54.0, lng: -2.5 },
    cities: [
      city("London", 51.5074, -0.1278),
      city("Manchester", 53.4808, -2.2426),
      city("Birmingham", 52.4862, -1.8904),
      city("Edinburgh", 55.9533, -3.1883),
      city("Glasgow", 55.8642, -4.2518),
      city("Bristol", 51.4545, -2.5879),
      city("Leeds", 53.8008, -1.5491),
      city("Liverpool", 53.4084, -2.9916),
    ],
  },
  {
    countryCode: "CA",
    center: { lat: 56.1, lng: -106.3 },
    cities: [
      city("Toronto", 43.6532, -79.3832),
      city("Vancouver", 49.2827, -123.1207),
      city("Montréal", 45.5017, -73.5673),
      city("Calgary", 51.0447, -114.0719),
      city("Ottawa", 45.4215, -75.6972),
      city("Edmonton", 53.5461, -113.4938),
    ],
  },
  {
    countryCode: "AU",
    center: { lat: -25.3, lng: 133.8 },
    cities: [
      city("Sydney", -33.8688, 151.2093),
      city("Melbourne", -37.8136, 144.9631),
      city("Brisbane", -27.4698, 153.0251),
      city("Perth", -31.9505, 115.8605),
      city("Adelaide", -34.9285, 138.6007),
      city("Canberra", -35.2809, 149.13),
    ],
  },
  { countryCode: "TR", center: TURKEY_CENTER, cities: TURKEY_CITIES },
];

export function discoverMarket(countryCode: string): DiscoverMarket | undefined {
  return DISCOVER_MARKETS.find((m) => m.countryCode === countryCode.toUpperCase());
}

const fold = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("en-US");

/** Şehir merkezi (büyük/küçük harf ve aksan duyarsız); bilinmiyorsa `null`. */
export function discoverCityCenter(countryCode: string, cityName: string): LatLng | null {
  const wanted = fold(cityName.trim());
  const found = discoverMarket(countryCode)?.cities.find((c) => fold(c.name) === wanted);
  return found ? { lat: found.lat, lng: found.lng } : null;
}

export interface DiscoverCategory {
  tr: string;
  en: string;
}

/** Keşfet kategorileri: Türkçe etiket + Places sorgusunda kullanılacak İngilizce terim. */
export const DISCOVER_CATEGORIES: DiscoverCategory[] = [
  { tr: "Diş Kliniği", en: "Dentist" },
  { tr: "Güzellik Merkezi", en: "Beauty salon" },
  { tr: "Veteriner", en: "Veterinarian" },
  { tr: "Kuaför", en: "Hair salon" },
  { tr: "Berber", en: "Barber shop" },
  { tr: "Fizyoterapi", en: "Physiotherapist" },
  { tr: "Psikolog", en: "Psychologist" },
  { tr: "Diyetisyen", en: "Dietitian" },
  { tr: "Spor Salonu", en: "Gym" },
  { tr: "Pilates", en: "Pilates studio" },
  { tr: "Restoran", en: "Restaurant" },
  { tr: "Kafe", en: "Cafe" },
  { tr: "Oto Servis", en: "Auto repair shop" },
  { tr: "Emlak Ofisi", en: "Real estate agency" },
  { tr: "Hukuk Bürosu", en: "Law firm" },
  { tr: "Eğitim Kurumu", en: "Tutoring center" },
  { tr: "Düğün Fotoğrafçısı", en: "Wedding photographer" },
];

/** Türkiye'de Türkçe, diğer pazarlarda İngilizce terim (G4'te dile göre sözlük genişler). */
export function categoryQueryTerm(category: DiscoverCategory, countryCode: string): string {
  return countryCode.toUpperCase() === "TR" ? category.tr : category.en;
}

/** Places metin sorgusu: "kategori anahtar-kelime ilçe şehir". */
export function discoverTextQuery(fields: { keyword: string; category: string; city: string; district: string }): string {
  return [fields.category, fields.keyword, fields.district, fields.city]
    .map((v) => v.trim())
    .filter(Boolean)
    .join(" ");
}

export interface ScanCategory {
  /** İşletmeye yazılan kategori (Türkçe etiket). */
  label: string;
  /** Places sorgusu. Konum sorguya yazılmaz; kare kısıtı zaten bölgeyi belirler. */
  query: string;
}

/** Şehir taraması için seçilen kategoriler (ADR 0014); bilinmeyen etiket atlanır. */
export function scanCategories(selectedLabels: string[], countryCode: string): ScanCategory[] {
  const selected = new Set(selectedLabels);
  return DISCOVER_CATEGORIES.filter((c) => selected.has(c.tr)).map((c) => ({ label: c.tr, query: categoryQueryTerm(c, countryCode) }));
}

/** Şehrin sınırını bulmak için Places sorgusu: "Austin, United States". */
export function cityBoundsQuery(city: string, countryCode: string): string {
  let country = countryCode.toUpperCase();
  try {
    country = new Intl.DisplayNames(["en"], { type: "region" }).of(country) ?? country;
  } catch {
    // Geçersiz kod: ham haliyle kullanılır.
  }
  return `${city.trim()}, ${country}`;
}

const fold2 = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("en-US").trim();

/**
 * Kayıtlı kategori metnini Keşfet kategorisinin Türkçe etiketine çevirir ("Dentist" → "Diş Kliniği").
 * Elle aramada Türkiye dışında İngilizce terim kaydedildiği için raporlarda aynı sektör tek satırda toplanır.
 * Listede olmayan kategori olduğu gibi döner.
 */
export function canonicalCategory(raw: string): string {
  const wanted = fold2(raw);
  const found = DISCOVER_CATEGORIES.find((c) => fold2(c.tr) === wanted || fold2(c.en) === wanted);
  return found ? found.tr : raw;
}
