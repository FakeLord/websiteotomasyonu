import { describe, expect, it } from "vitest";
import { resolveActiveSection, visibleSections } from "./sections";

const SECTIONS = [
  { key: "general", adminOnly: false },
  { key: "api", adminOnly: true },
  { key: "email", adminOnly: false },
  { key: "scoring", adminOnly: true },
] as const;

describe("visibleSections", () => {
  it("yöneticiye tüm bölümleri verir", () => {
    expect(visibleSections(SECTIONS, true).map((s) => s.key)).toEqual(["general", "api", "email", "scoring"]);
  });

  it("temsilciden yöneticiye özel bölümleri tamamen çıkarır", () => {
    expect(visibleSections(SECTIONS, false).map((s) => s.key)).toEqual(["general", "email"]);
  });
});

describe("resolveActiveSection", () => {
  it("görünür ve istenen bölümü seçer", () => {
    expect(resolveActiveSection(visibleSections(SECTIONS, true), "api")).toBe("api");
  });

  it("temsilci adres çubuğuna ?section=api yazsa bile ilk görünür bölüme düşer", () => {
    expect(resolveActiveSection(visibleSections(SECTIONS, false), "api")).toBe("general");
  });

  it("bilinmeyen veya boş istekte ilk görünür bölümü seçer", () => {
    expect(resolveActiveSection(visibleSections(SECTIONS, true), "zzz")).toBe("general");
    expect(resolveActiveSection(visibleSections(SECTIONS, true), null)).toBe("general");
  });
});
