import type { FetchPageResult, WebsiteFetcher } from "../website-fetcher";

export class MockWebsiteFetcher implements WebsiteFetcher {
  private readonly fixtures = new Map<string, FetchPageResult>();

  register(url: string, result: FetchPageResult): void {
    this.fixtures.set(url, result);
  }

  async fetchPage(url: string): Promise<FetchPageResult> {
    const fixture = this.fixtures.get(url);
    if (!fixture) {
      throw new Error(`MockWebsiteFetcher: no fixture registered for ${url}`);
    }
    return fixture;
  }
}
