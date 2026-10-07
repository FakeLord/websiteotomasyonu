import { describe, expect, it } from "vitest";
import { classifyMatch, type DedupeCandidate } from "./classify-match";

const existing = (overrides: Partial<DedupeCandidate>): DedupeCandidate => ({
  id: "e1",
  normalizedName: "downtown dental clinic",
  district: "Downtown",
  ...overrides,
});

describe("classifyMatch — ülke kapsamı", () => {
  it("aynı ad ve aynı ilçe adı başka ülkede ise POSSIBLE saymaz", () => {
    const result = classifyMatch(
      { normalizedName: "downtown dental clinic", district: "Downtown", countryCode: "AU" },
      [existing({ countryCode: "US" })],
    );
    expect(result.type).toBe("NONE");
  });

  it("aynı ülkede POSSIBLE eşleşir", () => {
    const result = classifyMatch(
      { normalizedName: "downtown dental clinic", district: "Downtown", countryCode: "US" },
      [existing({ countryCode: "US" })],
    );
    expect(result).toEqual({ type: "POSSIBLE", matchedId: "e1" });
  });

  it("ülkesi bilinmeyen eski kayıtlarla eskisi gibi eşleşir", () => {
    const result = classifyMatch({ normalizedName: "downtown dental clinic", district: "Downtown" }, [existing({})]);
    expect(result.type).toBe("POSSIBLE");
  });

  it("EXACT katmanlar (telefon, place_id) ülkeden bağımsızdır", () => {
    const result = classifyMatch(
      { normalizedName: "x", phoneE164: "+15125550132", countryCode: "CA" },
      [existing({ phoneE164: "+15125550132", countryCode: "US" })],
    );
    expect(result.type).toBe("EXACT");
  });
});
