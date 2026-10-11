import { describe, expect, it } from "vitest";
import { buildUnsubscribeUrls, isValidBrandedBase } from "./unsubscribe-url";

const token = "a".repeat(64);
const supabaseUrl = "https://proje.supabase.co/";

describe("buildUnsubscribeUrls", () => {
  it("kendi adres yokken ikisi de doğrudan Supabase fonksiyonudur", () => {
    const urls = buildUnsubscribeUrls({ supabaseUrl, token, language: "tr" });
    expect(urls?.headerUrl).toBe(`https://proje.supabase.co/functions/v1/unsubscribe?t=${token}&lang=tr`);
    expect(urls?.linkUrl).toBe(urls?.headerUrl);
  });

  it("kendi alan adı verilince görünen bağlantı onunla başlar; başlık adresi doğrudan kalır", () => {
    const urls = buildUnsubscribeUrls({ supabaseUrl, brandedBaseUrl: "https://hostlys.com/cikis", token, language: "en" });
    expect(urls?.linkUrl).toBe(`https://hostlys.com/cikis?t=${token}&lang=en`);
    expect(urls?.headerUrl).toContain("proje.supabase.co/functions/v1/unsubscribe");
  });

  it("bozuk veya güvensiz kendi adresi yok sayılır", () => {
    for (const bad of ["http://hostlys.com/cikis", "javascript:alert(1)", "https://x.com/a b", "https://localhost/x", "  "]) {
      const urls = buildUnsubscribeUrls({ supabaseUrl, brandedBaseUrl: bad, token, language: "tr" });
      expect(urls?.linkUrl, bad).toBe(urls?.headerUrl);
    }
  });

  it("https olmayan Supabase adresinde (yerel) veya bozuk belirteçte bağlantı üretilmez", () => {
    expect(buildUnsubscribeUrls({ supabaseUrl: "http://127.0.0.1:54321", token, language: "tr" })).toBeNull();
    expect(buildUnsubscribeUrls({ supabaseUrl: undefined, token, language: "tr" })).toBeNull();
    expect(buildUnsubscribeUrls({ supabaseUrl, token: "../etc", language: "tr" })).toBeNull();
  });

  it("dil yalnızca tr veya en olur", () => {
    expect(buildUnsubscribeUrls({ supabaseUrl, token, language: "de" })?.headerUrl).toContain("lang=tr");
  });
});

describe("isValidBrandedBase", () => {
  it("yalnızca https ve alan adı içeren adresleri kabul eder", () => {
    expect(isValidBrandedBase("https://hostlys.com/cikis")).toBe(true);
    expect(isValidBrandedBase("http://hostlys.com/cikis")).toBe(false);
    expect(isValidBrandedBase(null)).toBe(false);
  });
});
