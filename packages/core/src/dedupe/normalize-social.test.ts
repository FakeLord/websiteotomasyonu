import { describe, expect, it } from "vitest";
import { normalizeSocial } from "./normalize-social";

describe("normalizeSocial", () => {
  it("extracts the handle from a full Instagram URL", () => {
    expect(normalizeSocial("https://www.instagram.com/abc_dental/?hl=tr", "INSTAGRAM")).toBe(
      "instagram:abc_dental",
    );
  });

  it("accepts a bare handle with @ prefix", () => {
    expect(normalizeSocial("@abc_dental", "INSTAGRAM")).toBe("instagram:abc_dental");
  });

  it("rejects a post/reel link", () => {
    expect(normalizeSocial("https://www.instagram.com/p/C1234567/", "INSTAGRAM")).toBeNull();
  });

  it("rejects a URL from a different platform", () => {
    expect(normalizeSocial("https://www.facebook.com/abc_dental", "INSTAGRAM")).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(normalizeSocial("   ", "FACEBOOK")).toBeNull();
  });
});
