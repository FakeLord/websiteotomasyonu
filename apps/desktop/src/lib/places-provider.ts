import {
  PlacesQuotaError,
  boundsFromViewport,
  type GooglePlaceResult,
  type PlacesViewport,
  type SearchJobPage,
  type SearchJobProvider,
  type TileBounds,
} from "@lbf/core";
import { supabase } from "./supabase-client";
import { functionErrorMessage } from "./function-error";

interface FunctionsErrorWithContext {
  context?: { status?: number };
}

interface Market {
  regionCode: string;
  languageCode: string;
}

const statusOf = (error: unknown) => (error as FunctionsErrorWithContext).context?.status;

/**
 * `runSearchJob`'ın (packages/core) inject ettiği `SearchJobProvider` sözleşmesini
 * `places-search` Edge Function'ına bağlar. 429, hata fırlatmak yerine
 * `rateLimited:true` olarak eşlenir ki core'daki üstel geri çekilme çalışsın
 * (bkz. docs/adr/0004-places-vault.md). 402 (aylık sınır) `PlacesQuotaError` olur; yeniden denenmez.
 * `restriction` verilirse sonuçlar yalnızca o dikdörtgenden gelir (kare tarama, ADR 0014).
 */
export function createPlacesSearchAdapter(
  workspaceId: string,
  location?: { lat: number; lng: number; radiusMeters: number },
  market?: Market,
  restriction?: TileBounds,
): SearchJobProvider {
  return {
    async search({ textQuery, pageToken }): Promise<SearchJobPage> {
      const { data, error } = await supabase.functions.invoke("places-search", {
        body: { workspaceId, textQuery, pageToken, location, restriction, ...market },
      });

      if (error) {
        const status = statusOf(error);
        if (status === 429) {
          return { places: [], rateLimited: true };
        }
        const message = await functionErrorMessage(error, "Places araması başarısız oldu.");
        if (status === 402) throw new PlacesQuotaError(message);
        throw new Error(message);
      }

      const body = data as { places?: GooglePlaceResult[]; nextPageToken?: string };
      return { places: body.places ?? [], nextPageToken: body.nextPageToken };
    },
  };
}

export interface CityBounds {
  bounds: TileBounds;
  /** Google'ın bulduğu yerin adı/adresi; kullanıcı doğru şehri seçtiğini buradan görür. */
  label: string;
}

/**
 * Şehrin sınırını Places'tan alır (tek çağrı, ucuz kademe; aylık sayaçtan 1 düşer).
 * Şehir bulunamazsa veya sınırı kullanılamıyorsa `null`.
 */
export async function fetchCityBounds(workspaceId: string, textQuery: string, market: Market): Promise<CityBounds | null> {
  const { data, error } = await supabase.functions.invoke("places-search", {
    body: { workspaceId, textQuery, mode: "cityBounds", ...market },
  });
  if (error) {
    const message = await functionErrorMessage(error, "Şehir sınırı alınamadı.");
    if (statusOf(error) === 402) throw new PlacesQuotaError(message);
    throw new Error(message);
  }

  const place = (data as { places?: Array<{ viewport?: PlacesViewport; displayName?: { text?: string }; formattedAddress?: string }> })
    .places?.[0];
  const bounds = boundsFromViewport(place?.viewport);
  if (!place || !bounds) return null;
  return { bounds, label: place.formattedAddress ?? place.displayName?.text ?? textQuery };
}
