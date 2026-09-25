import { describe, expect, it } from "vitest";
import { trigramSimilarity } from "./string-similarity";

describe("trigramSimilarity", () => {
  it("returns 1 for identical strings", () => {
    expect(trigramSimilarity("abc dis klinigi", "abc dis klinigi")).toBe(1);
  });

  it("returns a high score for near-identical strings", () => {
    expect(trigramSimilarity("abc dis klinigi", "abc diş klinigi")).toBeGreaterThan(0.8);
  });

  it("returns a low score for unrelated strings", () => {
    expect(trigramSimilarity("abc dis klinigi", "xyz veteriner merkezi")).toBeLessThan(0.3);
  });
});
