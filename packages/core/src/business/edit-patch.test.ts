import { describe, expect, it } from "vitest";
import { buildBusinessPatch, type BusinessEditForm, type BusinessEditSource } from "./edit-patch";

const source: BusinessEditSource = {
  name: "Ecesu Beauty",
  category: "Güzellik Merkezi",
  address: "Çırçır Mah. No:9",
  city: "İstanbul",
  district: "Eyüpsultan",
  primaryPhoneE164: "+905065203822",
  websiteUrl: "https://ecesubeauty.com",
  countryCode: "TR",
};

const form = (overrides: Partial<BusinessEditForm> = {}): BusinessEditForm => ({
  name: source.name,
  category: source.category ?? "",
  address: source.address ?? "",
  city: source.city ?? "",
  district: source.district ?? "",
  phone: "0506 520 38 22",
  website: source.websiteUrl ?? "",
  ...overrides,
});

describe("buildBusinessPatch", () => {
  it("hiçbir şey değişmediyse boş yama döner", () => {
    const result = buildBusinessPatch(source, form());

    expect(result.patch).toEqual({});
    expect(result.changed).toEqual([]);
    expect(result.errors).toEqual({});
    expect(result.websiteChanged).toBe(false);
  });

  it("yalnızca değişen alanları yamaya koyar ve boşlukları kırpar", () => {
    const result = buildBusinessPatch(source, form({ name: "  Ecesu Beauty Studio ", district: "Kağıthane" }));

    expect(result.patch).toEqual({ name: "Ecesu Beauty Studio", district: "Kağıthane" });
    expect(result.changed).toEqual(["name", "district"]);
  });

  it("boşaltılan alanı null olarak temizler", () => {
    const result = buildBusinessPatch(source, form({ category: "   ", address: "" }));

    expect(result.patch).toEqual({ category: null, address: null });
  });

  it("ad boş olamaz", () => {
    expect(buildBusinessPatch(source, form({ name: "   " })).errors).toEqual({ name: "NAME_REQUIRED" });
  });

  it("ad 200 karakteri aşamaz", () => {
    expect(buildBusinessPatch(source, form({ name: "a".repeat(201) })).errors).toEqual({ name: "NAME_TOO_LONG" });
  });

  describe("telefon", () => {
    it("işletmenin ülkesine göre E.164'e çevirir", () => {
      const result = buildBusinessPatch(source, form({ phone: "0532 111 22 33" }));

      expect(result.patch).toEqual({ phone: "+905321112233" });
    });

    it("aynı numara başka biçimde yazılsa da değişiklik sayılmaz", () => {
      expect(buildBusinessPatch(source, form({ phone: "+90 506 520 38 22" })).patch).toEqual({});
    });

    it("yabancı ülkede ülke koduna göre çözer", () => {
      const us = { ...source, countryCode: "US", primaryPhoneE164: null };

      expect(buildBusinessPatch(us, form({ phone: "(512) 555-0132" })).patch).toEqual({ phone: "+15125550132" });
    });

    it("geçersiz numarayı reddeder", () => {
      expect(buildBusinessPatch(source, form({ phone: "12345" })).errors).toEqual({ phone: "INVALID_PHONE" });
    });

    it("boşaltılırsa telefonu temizler", () => {
      expect(buildBusinessPatch(source, form({ phone: "" })).patch).toEqual({ phone: null });
    });
  });

  describe("web sitesi", () => {
    it("şema yoksa https ekler, alan adını çıkarır ve yeniden analiz gerektirir", () => {
      const result = buildBusinessPatch(source, form({ website: "www.yenisite.com/iletisim" }));

      expect(result.patch).toEqual({ websiteUrl: "https://www.yenisite.com/iletisim", websiteDomain: "yenisite.com" });
      expect(result.websiteChanged).toBe(true);
    });

    it("aynı adres şemasız yazılsa da değişiklik sayılmaz", () => {
      const result = buildBusinessPatch(source, form({ website: "ecesubeauty.com" }));

      expect(result.patch).toEqual({});
      expect(result.websiteChanged).toBe(false);
    });

    it("boşaltılırsa siteyi ve alan adını temizler", () => {
      const result = buildBusinessPatch(source, form({ website: "" }));

      expect(result.patch).toEqual({ websiteUrl: null, websiteDomain: null });
      expect(result.websiteChanged).toBe(true);
    });

    it("sosyal medya adresi web sitesi olarak kabul edilmez", () => {
      expect(buildBusinessPatch(source, form({ website: "instagram.com/ecesu" })).errors).toEqual({ website: "SOCIAL_AS_WEBSITE" });
      expect(buildBusinessPatch(source, form({ website: "https://linktr.ee/ecesu" })).errors).toEqual({ website: "SOCIAL_AS_WEBSITE" });
    });

    it("çözülemeyen adresi reddeder", () => {
      expect(buildBusinessPatch(source, form({ website: "http://" })).errors).toEqual({ website: "INVALID_WEBSITE" });
      expect(buildBusinessPatch(source, form({ website: "bu bir site değil" })).errors).toEqual({ website: "INVALID_WEBSITE" });
    });
  });

  it("hatalı alan varken diğer geçerli alanların yaması yine de hesaplanır (arayüz hepsini birden gösterebilsin)", () => {
    const result = buildBusinessPatch(source, form({ name: "", district: "Şişli" }));

    expect(result.errors.name).toBe("NAME_REQUIRED");
    expect(result.patch).toEqual({ district: "Şişli" });
  });
});
