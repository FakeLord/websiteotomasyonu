import { invoke } from "@tauri-apps/api/core";
import type { WebsiteFetchResult, WebsiteFetcherLike } from "@lbf/core";

/**
 * `runWebsiteAnalysis`'ın (packages/core) beklediği `WebsiteFetcherLike`
 * sözleşmesini Rust `fetch_page` komutuna bağlar (timeout/boyut/redirect/SSRF
 * engeli Rust tarafında — bkz. src-tauri/src/commands/website.rs).
 */
export const tauriWebsiteFetcher: WebsiteFetcherLike = {
  async fetchPage(url: string): Promise<WebsiteFetchResult> {
    return invoke<WebsiteFetchResult>("fetch_page", { url });
  },
};
