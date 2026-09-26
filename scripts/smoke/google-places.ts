/**
 * Google Places API (New) Text Search uç noktasına karşı gerçek bir çağrı yapar.
 * CLAUDE.md #6: gerçek API çağrısı yalnızca burada, elle çalıştırılır.
 *
 * Çalıştırma:
 *   GOOGLE_PLACES_API_KEY=AIza... pnpm exec tsx scripts/smoke/google-places.ts
 */
import { placeToBusinessPayload, type GooglePlaceResult } from "../../packages/core/src/index.ts";

// places-search Edge Function'ıyla (supabase/functions/places-search/index.ts) birebir aynı
// field mask — gerçek maliyeti/SKU'yu bozmadan doğrulamak için.
const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
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

async function main() {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    console.error("GOOGLE_PLACES_API_KEY ortam değişkeni gerekli.");
    process.exit(1);
  }

  const textQuery = "Kadıköy diş kliniği";
  console.log(`→ https://places.googleapis.com/v1/places:searchText ("${textQuery}")`);
  const started = Date.now();

  const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": FIELD_MASK,
    },
    body: JSON.stringify({
      textQuery,
      languageCode: "tr",
      regionCode: "TR",
      pageSize: 5,
    }),
  });

  const latencyMs = Date.now() - started;

  if (!response.ok) {
    const text = await response.text();
    console.error(`✗ HTTP ${response.status} (${latencyMs}ms):`, text);
    process.exit(1);
  }

  const result = (await response.json()) as { places?: GooglePlaceResult[]; nextPageToken?: string };
  const places = result.places ?? [];
  console.log(`✓ ${places.length} sonuç (${latencyMs}ms), nextPageToken: ${result.nextPageToken ? "var" : "yok"}`);

  if (places.length === 0) {
    console.warn("⚠ Sonuç boş döndü — sorgu veya API anahtarı kotasını kontrol edin.");
    return;
  }

  console.log("\nplaceToBusinessPayload() ile dönüşüm:");
  for (const place of places) {
    const payload = placeToBusinessPayload(place);
    console.log(`- ${payload.name} | ${payload.city ?? "?"}/${payload.district ?? "?"} | ` +
      `website: ${payload.websiteUrl ?? "yok"} | tel: ${payload.phoneE164 ?? "yok"} | ` +
      `businessStatus: ${payload.businessStatus ?? "?"}`);
  }
}

main().catch((err) => {
  console.error("✗ Beklenmeyen hata:", err);
  process.exit(1);
});
