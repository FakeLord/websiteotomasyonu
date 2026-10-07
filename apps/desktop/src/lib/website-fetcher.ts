import type { WebsiteFetchResult, WebsiteFetcherLike } from "@lbf/core";
import { platform } from "./platform";

/**
 * `runWebsiteAnalysis`'ın (packages/core) beklediği `WebsiteFetcherLike`
 * sözleşmesini kabuğun `fetch_page` uygulamasına bağlar. Timeout/boyut/redirect/
 * SSRF engeli kabuk tarafındadır (Rust: src-tauri/src/commands/website.rs,
 * tarayıcı modu: apps/local-server/src/routes/website.ts).
 */
export const platformWebsiteFetcher: WebsiteFetcherLike = {
  async fetchPage(url: string): Promise<WebsiteFetchResult> {
    return platform.fetchPage(url);
  },
};
