export interface FetchPageResult {
  finalUrl: string;
  httpStatus: number;
  redirectCount: number;
  responseMs: number;
  https: boolean;
  html: string;
}

/**
 * Pasif website fetch sözleşmesi (SPEC.md → H). Rust tarafındaki `fetch_page`
 * komutunu sarmalar; timeout/boyut/redirect sınırları ve özel IP engeli
 * implementasyon tarafında (Faz 4) uygulanır.
 */
export interface WebsiteFetcher {
  fetchPage(url: string): Promise<FetchPageResult>;
}
