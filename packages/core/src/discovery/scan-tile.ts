import type { GooglePlaceResult } from "./place-to-business";
import { runSearchJob, type SearchJobClock, type SearchJobProvider } from "./run-search-job";
import { shouldSplitTile } from "./tiling";

/** Aylık Places çağrı sınırı doldu (places-search 402 `QUOTA_EXCEEDED`). Yeniden denenmez; plan duraklar. */
export class PlacesQuotaError extends Error {
  constructor(message = "Aylık Places çağrı sınırı doldu") {
    super(message);
    this.name = "PlacesQuotaError";
  }
}

/** `complete_scan_tile` RPC'sinin `p_outcome` değerleri. */
export type ScanTileOutcome = "DONE" | "SPLIT" | "QUOTA" | "FAILED";

export interface ScanTileResult {
  outcome: ScanTileOutcome;
  /** Tekilleştirilmiş sonuçlar; QUOTA/FAILED durumunda o ana kadar gelenler (ücreti ödendi, kaydedilir). */
  places: GooglePlaceResult[];
  /** Google'a gerçekten giden çağrı sayısı (sınır nedeniyle reddedilen sayılmaz). */
  apiCalls: number;
  error: string | null;
}

/**
 * Tek bir kareyi tarar (en çok 3 sayfa) ve karenin nasıl kapatılacağına karar verir (ADR 0014).
 * Saf orkestrasyondur: kısıt dikdörtgeni `provider`'ın içindedir.
 */
export async function scanTile(
  provider: SearchJobProvider,
  clock: SearchJobClock,
  tile: { textQuery: string; depth: number },
): Promise<ScanTileResult> {
  const byId = new Map<string, GooglePlaceResult>();
  let apiCalls = 0;
  let pages = 0;

  const recording: SearchJobProvider = {
    async search(params) {
      const page = await provider.search(params);
      apiCalls += 1;
      if (!page.rateLimited) {
        pages += 1;
        for (const place of page.places) if (!byId.has(place.id)) byId.set(place.id, place);
      }
      return page;
    },
  };

  const result = (outcome: ScanTileOutcome, error: string | null): ScanTileResult => ({
    outcome,
    places: [...byId.values()],
    apiCalls,
    error,
  });

  try {
    await runSearchJob(recording, clock, tile.textQuery);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bilinmeyen hata";
    return result(error instanceof PlacesQuotaError ? "QUOTA" : "FAILED", message);
  }

  if (pages === 0) return result("FAILED", "Google Places hız sınırı: sayfa alınamadı");
  return result(shouldSplitTile(byId.size, tile.depth) ? "SPLIT" : "DONE", null);
}
