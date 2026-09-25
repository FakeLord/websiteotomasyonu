export interface PlacesSearchParams {
  query: string;
  regionCode: string;
  languageCode: string;
  pageToken?: string;
}

export interface PlaceResult {
  placeId: string;
  displayName: string;
  formattedAddress: string;
  location: { lat: number; lng: number };
  types: string[];
  businessStatus: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  rating?: number;
  userRatingCount?: number;
  googleMapsUri?: string;
}

export interface PlacesSearchResult {
  results: PlaceResult[];
  nextPageToken?: string;
}

/**
 * Google Places (New) Text Search sözleşmesi (SPEC.md → G.1). Faz 3'te
 * `places-search` Edge Function arkasında somutlaştırılır.
 */
export interface PlacesProvider {
  searchText(params: PlacesSearchParams): Promise<PlacesSearchResult>;
}
