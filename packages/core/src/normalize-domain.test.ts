import { describe, expect, it } from "vitest";
import { normalizeDomain } from "./normalize-domain";

describe("normalizeDomain", () => {
  it("strips scheme and www prefix", () => {
    expect(normalizeDomain("https://www.example.com/")).toBe("example.com");
  });

  it("adds https scheme when missing", () => {
    expect(normalizeDomain("example.com/path")).toBe("example.com");
  });

  it("lowercases the host", () => {
    expect(normalizeDomain("HTTPS://Example.COM")).toBe("example.com");
  });

  it("returns empty string for empty input", () => {
    expect(normalizeDomain("   ")).toBe("");
  });

  it("falls back gracefully for unparsable input", () => {
    expect(normalizeDomain("not a url")).toBe("not a url");
  });
});
