// places-search istek doğrulaması ve Google isteğinin kurulması (saf; Deno testi validate.test.ts).

export interface LocationBias {
  lat: number;
  lng: number;
  radiusMeters: number;
}

export interface RequestBody {
  workspaceId: string;
  textQuery: string;
  pageToken?: string;
  location?: LocationBias;
  /** ISO-3166-1 alpha-2, büyük harf. Verilmezse `TR` (eski davranış). */
  regionCode?: string;
  /** BCP-47 (en, en-GB, tr). Verilmezse `tr` (eski davranış). */
  languageCode?: string;
}

const DEFAULT_REGION = "TR";
const DEFAULT_LANGUAGE = "tr";

function isValidLocation(value: unknown): value is LocationBias {
  if (typeof value !== "object" || value === null) return false;
  const loc = value as Record<string, unknown>;
  return (
    typeof loc.lat === "number" && loc.lat >= -90 && loc.lat <= 90 &&
    typeof loc.lng === "number" && loc.lng >= -180 && loc.lng <= 180 &&
    typeof loc.radiusMeters === "number" && loc.radiusMeters > 0 && loc.radiusMeters <= 50000
  );
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
    pageSize: 20,
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
  };
}
