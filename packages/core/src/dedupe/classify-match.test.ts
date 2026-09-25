import { describe, expect, it } from "vitest";
import { classifyMatch, type DedupeCandidate } from "./classify-match";

const existing: DedupeCandidate[] = [
  {
    id: "biz-1",
    websiteDomain: "abcdis.com",
    normalizedName: "abc dis klinigi",
    district: "kadikoy",
  },
];

describe("classifyMatch", () => {
  it("returns EXACT for a matching website domain", () => {
    const result = classifyMatch(
      { websiteDomain: "abcdis.com", normalizedName: "abc diş klinigi farklı yazım", district: "kadikoy" },
      existing,
    );
    expect(result).toEqual({ type: "EXACT", matchedId: "biz-1" });
  });

  it("returns EXACT for a matching google place id even if names differ", () => {
    const withPlaceId: DedupeCandidate[] = [
      { id: "biz-2", googlePlaceId: "place-123", normalizedName: "x", district: null },
    ];
    const result = classifyMatch(
      { googlePlaceId: "place-123", normalizedName: "y" },
      withPlaceId,
    );
    expect(result).toEqual({ type: "EXACT", matchedId: "biz-2" });
  });

  it("returns POSSIBLE for a fuzzy name match in the same district", () => {
    const result = classifyMatch(
      { normalizedName: "abc dis klinigii", district: "kadikoy" },
      existing,
    );
    expect(result.type).toBe("POSSIBLE");
    expect(result.matchedId).toBe("biz-1");
  });

  it("returns NONE when nothing matches", () => {
    const result = classifyMatch(
      { normalizedName: "tamamen farkli isletme", district: "besiktas" },
      existing,
    );
    expect(result).toEqual({ type: "NONE" });
  });
});
