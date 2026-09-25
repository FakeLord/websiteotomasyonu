import { describe, expect, it } from "vitest";
import { runWebsiteAnalysis } from "./run-website-analysis";
import type { WebsiteFetchResult, WebsiteFetcherLike } from "./types";

function page(overrides: Partial<WebsiteFetchResult> & { html: string }): WebsiteFetchResult {
  return {
    finalUrl: "https://abcdis.com",
    httpStatus: 200,
    redirectCount: 0,
    responseMs: 400,
    https: true,
    ...overrides,
  };
}

class FakeFetcher implements WebsiteFetcherLike {
  private readonly pages = new Map<string, WebsiteFetchResult | Error>();

  register(url: string, result: WebsiteFetchResult | Error): void {
    this.pages.set(url, result);
  }

  async fetchPage(url: string): Promise<WebsiteFetchResult> {
    const entry = this.pages.get(url);
    if (!entry) throw new Error(`FakeFetcher: no fixture for ${url}`);
    if (entry instanceof Error) throw entry;
    return entry;
  }
}

const GOOD_HTML = `<html><head>
  <meta name="viewport" content="width=device-width">
  <title>ABC Diş Kliniği - Kadıköy İmplant ve Ortodonti Merkezi</title>
  <meta name="description" content="Kadıköy'de 20 yıldır hizmet veren diş kliniğimiz implant, ortodonti ve estetik diş hekimliği sunar.">
</head><body>
  <p>${"Kadıköy'de hizmet veren diş kliniğimiz hakkında bilgi almak için bize ulaşın. ".repeat(4)}</p>
  <a href="tel:+905321234567">Ara</a>
  <a href="mailto:info@abcdis.com">Yaz</a>
  <a href="https://instagram.com/abcdis">Instagram</a>
</body></html>`;

describe("runWebsiteAnalysis", () => {
  it("returns NO_WEBSITE without fetching when there is no URL", async () => {
    const fetcher = new FakeFetcher();
    const result = await runWebsiteAnalysis(fetcher, { websiteUrl: undefined });
    expect(result.status).toBe("NO_WEBSITE");
    expect(result.pagesFetched).toBe(0);
  });

  it("returns NO_WEBSITE for an Instagram-only websiteUrl", async () => {
    const fetcher = new FakeFetcher();
    const result = await runWebsiteAnalysis(fetcher, { websiteUrl: "https://instagram.com/abc" });
    expect(result.status).toBe("NO_WEBSITE");
  });

  it("returns BROKEN_WEBSITE when the fetch throws (DNS)", async () => {
    const fetcher = new FakeFetcher();
    fetcher.register("https://abcdis.com", new Error("DNS çözümlenemedi: abcdis.com"));
    const result = await runWebsiteAnalysis(fetcher, { websiteUrl: "abcdis.com" });
    expect(result.status).toBe("BROKEN_WEBSITE");
    expect(result.brokenReason).toBe("DNS");
  });

  it("returns BROKEN_WEBSITE on HTTP 404", async () => {
    const fetcher = new FakeFetcher();
    fetcher.register("https://abcdis.com", page({ html: "<html>not found</html>", httpStatus: 404 }));
    const result = await runWebsiteAnalysis(fetcher, { websiteUrl: "abcdis.com" });
    expect(result.status).toBe("BROKEN_WEBSITE");
    expect(result.brokenReason).toBe("HTTP_ERROR");
  });

  it("returns BROKEN_WEBSITE for a parked page", async () => {
    const fetcher = new FakeFetcher();
    fetcher.register("https://abcdis.com", page({ html: "<h1>This domain is for sale</h1>" }));
    const result = await runWebsiteAnalysis(fetcher, { websiteUrl: "abcdis.com" });
    expect(result.status).toBe("BROKEN_WEBSITE");
    expect(result.brokenReason).toBe("PARKED");
  });

  it("classifies a healthy site as GOOD_WEBSITE and extracts contacts, without fetching robots.txt-blocked pages", async () => {
    const fetcher = new FakeFetcher();
    fetcher.register("https://abcdis.com", page({ html: GOOD_HTML }));
    fetcher.register("https://abcdis.com/robots.txt", page({ html: "User-agent: *\nDisallow: /iletisim" }));
    const result = await runWebsiteAnalysis(fetcher, { websiteUrl: "abcdis.com" });

    expect(result.status).toBe("GOOD_WEBSITE");
    expect(result.pagesFetched).toBe(1);
    expect(result.contacts.some((c) => c.channel === "PHONE")).toBe(true);
    expect(result.contacts.some((c) => c.channel === "EMAIL")).toBe(true);
  });

  it("follows an allowed inner contact page and merges its contacts", async () => {
    const fetcher = new FakeFetcher();
    const homeHtml = `<html><body><nav><a href="/iletisim">İletişim</a></nav><p>${"Ana sayfa içeriği burada uzunca bir metin olarak yer alır. ".repeat(4)}</p></body></html>`;
    fetcher.register("https://abcdis.com", page({ html: homeHtml }));
    fetcher.register("https://abcdis.com/robots.txt", page({ html: "User-agent: *\nDisallow:" }));
    fetcher.register(
      "https://abcdis.com/iletisim",
      page({ finalUrl: "https://abcdis.com/iletisim", html: `<a href="mailto:info@abcdis.com">Yaz</a>` }),
    );

    const result = await runWebsiteAnalysis(fetcher, { websiteUrl: "abcdis.com" });
    expect(result.pagesFetched).toBe(2);
    expect(result.contacts.some((c) => c.channel === "EMAIL")).toBe(true);
  });

  it("treats a missing robots.txt as permissive and still analyzes the homepage", async () => {
    const fetcher = new FakeFetcher();
    fetcher.register("https://abcdis.com", page({ html: GOOD_HTML }));
    fetcher.register("https://abcdis.com/robots.txt", new Error("404"));
    const result = await runWebsiteAnalysis(fetcher, { websiteUrl: "abcdis.com" });
    expect(result.status).toBe("GOOD_WEBSITE");
  });

  it("classifies a low-quality site with multiple issues", async () => {
    const fetcher = new FakeFetcher();
    const lowQualityHtml = `<html><body><p>${"x".repeat(300)}</p></body></html>`;
    fetcher.register("https://abcdis.com", page({ html: lowQualityHtml, https: false }));
    fetcher.register("https://abcdis.com/robots.txt", new Error("404"));
    const result = await runWebsiteAnalysis(fetcher, { websiteUrl: "abcdis.com" });
    expect(result.status).toBe("LOW_QUALITY_WEBSITE");
    expect(result.issues.length).toBeGreaterThan(0);
  });
});
