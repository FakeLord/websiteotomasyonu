import type { GooglePlaceResult } from "./place-to-business";

export interface SearchJobPage {
  places: GooglePlaceResult[];
  nextPageToken?: string | undefined;
  rateLimited?: boolean | undefined;
}

export interface SearchJobProvider {
  search(params: { textQuery: string; pageToken?: string | undefined }): Promise<SearchJobPage>;
}

export interface SearchJobClock {
  sleep(ms: number): Promise<void>;
}

export interface RunSearchJobOptions {
  maxPages?: number;
  delayMs?: number;
  maxRetries?: number;
}

export interface RunSearchJobResult {
  places: GooglePlaceResult[];
  apiCalls: number;
  pages: number;
}

/**
 * Places arama kuyruğunun saf orkestrasyon mantığı (SPEC.md → G.1: istekler
 * arası 1 sn, 429'da üstel geri çekilme, en fazla 3 sayfa/~60 sonuç). Provider
 * ve clock inject edilir ki `MockPlacesProvider`/`MockClock` ile test edilsin;
 * gerçek çağrı `places-search` Edge Function'ını saran adapter'dan gelir.
 */
export async function runSearchJob(
  provider: SearchJobProvider,
  clock: SearchJobClock,
  textQuery: string,
  options: RunSearchJobOptions = {},
): Promise<RunSearchJobResult> {
  const maxPages = options.maxPages ?? 3;
  const delayMs = options.delayMs ?? 1000;
  const maxRetries = options.maxRetries ?? 3;

  const places: GooglePlaceResult[] = [];
  let pageToken: string | undefined;
  let apiCalls = 0;
  let pages = 0;

  for (let page = 0; page < maxPages; page += 1) {
    let succeeded = false;

    for (let attempt = 0; attempt < maxRetries && !succeeded; attempt += 1) {
      const result = await provider.search({ textQuery, pageToken });
      apiCalls += 1;

      if (result.rateLimited) {
        await clock.sleep(delayMs * 2 ** (attempt + 1));
        continue;
      }

      places.push(...result.places);
      pageToken = result.nextPageToken;
      pages += 1;
      succeeded = true;
    }

    if (!succeeded || !pageToken) break;
    await clock.sleep(delayMs);
  }

  return { places, apiCalls, pages };
}
