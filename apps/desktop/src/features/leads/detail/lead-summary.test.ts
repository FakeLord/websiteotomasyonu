import { describe, expect, it } from "vitest";
import { buildLeadSummary } from "./lead-summary";

describe("buildLeadSummary", () => {
  it("describes a strong no-website lead with a good reputation", () => {
    const text = buildLeadSummary({ websiteStatus: "NO_WEBSITE", rating: 4.8, reviewCount: 124, channelCount: 3, score: 92 });
    expect(text).toContain("web sitesi yok");
    expect(text).toContain("4,8");
    expect(text).toContain("124");
    expect(text).toContain("3 iletişim kanalı");
    expect(text).toContain("Güçlü bir aday");
  });

  it("handles missing analysis, rating and channels", () => {
    const text = buildLeadSummary({ websiteStatus: null, rating: null, reviewCount: null, channelCount: 0, score: 10 });
    expect(text).toContain("henüz analiz edilmedi");
    expect(text).toContain("iletişim kanalı bulunamadı");
    expect(text).toContain("Düşük öncelikli");
  });
});
