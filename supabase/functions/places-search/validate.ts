// places-search istek doğrulaması ve Google isteğinin kurulması (saf; Deno testi validate.test.ts).

export interface LocationBias {
  lat: number;
  lng: number;
  radiusMeters: number;
}

interface Point {
  lat: number;
  lng: number;
}

/** `low` güneybatı, `high` kuzeydoğu köşe (packages/core/discovery/tiling.ts ile aynı). */
export interface Restriction {
  low: Point;
  high: Point;
}

/** `cityBounds`: şehrin sınırını (`viewport`) almak için ucuz, tek sonuçlu sorgu. */
export type SearchMode = "search" | "cityBounds";

export interface RequestBody {
  workspaceId: string;
  textQuery: string;
  pageToken?: string;
  location?: LocationBias;
  /** Kare tarama: sonuçlar yalnızca bu dikdörtgenin içinden gelir (sert filtre). */
  restriction?: Restriction;
  mode?: SearchMode;
  /** ISO-3166-1 alpha-2, büyük harf. Verilmezse `TR` (eski davranış). */
  regionCode?: string;
  /** BCP-47 (en, en-GB, tr). Verilmezse `tr` (eski davranış). */
  languageCode?: string;
}

const DEFAULT_REGION = "TR";
const DEFAULT_LANGUAGE = "tr";

// docs/SPEC.md → G.1: "tek field mask". `websiteUri`, telefon ve `rating` Enterprise kademesidir (ADR 0014).
// nextPageToken üst seviye bir alan olduğu için maskeye ayrıca eklenmeli, yoksa sayfalama kırılır.
const SEARCH_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.addressComponents",
  "places.location",
  "places.types",
  "places.businessStatus",
  "places.nationalPhoneNumber",
  "places.internationalPhoneNumber",
  "places.websiteUri",
  "places.rating",
  "places.userRatingCount",
  "places.googleMapsUri",
  "nextPageToken",
].join(",");

// Yalnızca Pro kademesi alanlar: şehir sınırı sorgusu pahalı kademeyi tetiklemez.
const CITY_BOUNDS_FIELD_MASK = ["places.id", "places.displayName", "places.formattedAddress", "places.viewport"].join(",");

export function fieldMaskFor(mode: SearchMode | undefined): string {
  return mode === "cityBounds" ? CITY_BOUNDS_FIELD_MASK : SEARCH_FIELD_MASK;
}

function isValidLocation(value: unknown): value is LocationBias {
  if (typeof value !== "object" || value === null) return false;
  const loc = value as Record<string, unknown>;
  return (
    typeof loc.lat === "number" && loc.lat >= -90 && loc.lat <= 90 &&
    typeof loc.lng === "number" && loc.lng >= -180 && loc.lng <= 180 &&
    typeof loc.radiusMeters === "number" && loc.radiusMeters > 0 && loc.radiusMeters <= 50000
  );
}

function isPoint(value: unknown): value is Point {
  if (typeof value !== "object" || value === null) return false;
  const point = value as Record<string, unknown>;
  return (
    typeof point.lat === "number" && Number.isFinite(point.lat) && point.lat >= -90 && point.lat <= 90 &&
    typeof point.lng === "number" && Number.isFinite(point.lng) && point.lng >= -180 && point.lng <= 180
  );
}

// 180° boylamını aşan dikdörtgen (doğu ucu batıdan küçük) bilerek reddedilir; kare bölme bunu desteklemez.
function isValidRestriction(value: unknown): value is Restriction {
  if (typeof value !== "object" || value === null) return false;
  const rect = value as Record<string, unknown>;
  return isPoint(rect.low) && isPoint(rect.high) && rect.low.lat < rect.high.lat && rect.low.lng < rect.high.lng;
}

export function isValidBody(value: unknown): value is RequestBody {
  if (typeof value !== "object" || value === null) return false;
  const body = value as Record<string, unknown>;
  return (
    typeof body.workspaceId === "string" &&
    body.workspaceId.length > 0 &&
    typeof body.textQuery === "string" &&
    body.textQuery.trim().length > 0 &&
    (body.pageToken === undefined || typeof body.pageToken === "string") &&
    (body.location === undefined || isValidLocation(body.location)) &&
    (body.restriction === undefined || isValidRestriction(body.restriction)) &&
    // Places aynı istekte hem locationBias hem locationRestriction kabul etmez.
    !(body.location !== undefined && body.restriction !== undefined) &&
    (body.mode === undefined || body.mode === "search" || body.mode === "cityBounds") &&
    (body.regionCode === undefined || (typeof body.regionCode === "string" && /^[A-Z]{2}$/.test(body.regionCode))) &&
    (body.languageCode === undefined ||
      (typeof body.languageCode === "string" && /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(body.languageCode)))
  );
}

/** Places Text Search (New) istek gövdesi. */
export function buildSearchRequest(body: RequestBody): Record<string, unknown> {
  return {
    textQuery: body.textQuery,
    languageCode: body.languageCode ?? DEFAULT_LANGUAGE,
    regionCode: body.regionCode ?? DEFAULT_REGION,
    pageSize: body.mode === "cityBounds" ? 1 : 20,
    ...(body.pageToken ? { pageToken: body.pageToken } : {}),
    // Harita üzerinden seçilen merkez + yarıçap; Places bunu sonuçları o
    // bölgeye yakın olanlara ağırlık vermek için kullanır (sert filtre değil).
    ...(body.location
      ? {
          locationBias: {
            circle: {
              center: { latitude: body.location.lat, longitude: body.location.lng },
              radius: body.location.radiusMeters,
            },
          },
        }
      : {}),
    // Kare tarama: Text Search (New) kısıt olarak yalnızca dikdörtgen kabul eder.
    ...(body.restriction
      ? {
          locationRestriction: {
            rectangle: {
              low: { latitude: body.restriction.low.lat, longitude: body.restriction.low.lng },
              high: { latitude: body.restriction.high.lat, longitude: body.restriction.high.lng },
            },
          },
        }
      : {}),
  };
}
