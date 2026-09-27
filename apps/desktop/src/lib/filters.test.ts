import { describe, expect, it } from "vitest";
import { toCsv, turkishLikePattern } from "./filters";

describe("turkishLikePattern", () => {
  it("turns every dotted/dotless i variant into a single-char wildcard", () => {
    expect(turkishLikePattern("İstanbul")).toBe("%_stanbul%");
    expect(turkishLikePattern("Kadıköy", "exact")).toBe("Kad_köy");
    expect(turkishLikePattern("DİŞ KLİNİĞİ")).toBe("%D_Ş KL_N_Ğ_%");
  });

  it("strips PostgREST-breaking characters", () => {
    expect(turkishLikePattern("a,b(c)%*")).toBe("%a b c%");
  });
});

describe("toCsv", () => {
  it("uses semicolons, quotes special values and guards formula injection", () => {
    const csv = toCsv(
      [{ name: 'ABC "Diş"', score: 90, note: "=HYPERLINK()" }],
      [
        { key: "name", label: "İşletme" },
        { key: "score", label: "Puan" },
        { key: "note", label: "Not" },
      ],
    );
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1)).toBe('İşletme;Puan;Not\r\n"ABC ""Diş""";90;\'=HYPERLINK()');
  });
});
