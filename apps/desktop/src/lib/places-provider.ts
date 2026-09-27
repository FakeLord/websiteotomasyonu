import type { GooglePlaceResult, SearchJobPage, SearchJobProvider } from "@lbf/core";
import { supabase } from "./supabase-client";

interface FunctionsErrorWithContext {
  context?: { status?: number };
}

/**
 * `runSearchJob`'ın (packages/core) inject ettiği `SearchJobProvider` sözleşmesini
 * `places-search` Edge Function'ına bağlar. 429, hata fırlatmak yerine
 * `rateLimited:true` olarak eşlenir ki core'daki üstel geri çekilme çalışsın
 * (bkz. docs/adr/0004-places-vault.md).
 */
export function createPlacesSearchAdapter(
  workspaceId: string,
  location?: { lat: number; lng: number; radiusMeters: number },
): SearchJobProvider {
  return {
    async search({ textQuery, pageToken }): Promise<SearchJobPage> {
      const { data, error } = await supabase.functions.invoke("places-search", {
        body: { workspaceId, textQuery, pageToken, location },
      });

      if (error) {
        const status = (error as FunctionsErrorWithContext).context?.status;
        if (status === 429) {
          return { places: [], rateLimited: true };
        }
        throw error;
      }

      const body = data as { places?: GooglePlaceResult[]; nextPageToken?: string };
      return { places: body.places ?? [], nextPageToken: body.nextPageToken };
    },
  };
}
