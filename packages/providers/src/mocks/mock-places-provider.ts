import type {
  PlacesProvider,
  PlacesSearchParams,
  PlacesSearchResult,
} from "../places-provider";

export class MockPlacesProvider implements PlacesProvider {
  constructor(private readonly fixture: PlacesSearchResult) {}

  async searchText(_params: PlacesSearchParams): Promise<PlacesSearchResult> {
    return this.fixture;
  }
}
