import { describe, expect, it } from "vitest";
import { normalizeWebsiteInput } from "./normalize-url";

describe("normalizeWebsiteInput", () => {
  it("returns null for empty/undefined input", () => {
    expect(normalizeWebsiteInput(undefined)).toBeNull();
    expect(normalizeWebsiteInput(null)).toBeNull();
    expect(normalizeWebsiteInput("")).toBeNull();
    expect(normalizeWebsiteInput("   ")).toBeNull();
  });

  it("adds https scheme when missing", () => {
    expect(normalizeWebsiteInput("abcdis.com")).toBe("https://abcdis.com");
  });

  it("keeps an existing scheme", () => {
    expect(normalizeWebsiteInput("http://abcdis.com")).toBe("http://abcdis.com");
  });

  it("treats Instagram/Facebook URLs as no website", () => {
    expect(normalizeWebsiteInput("https://www.instagram.com/abc")).toBeNull();
    expect(normalizeWebsiteInput("https://facebook.com/abc")).toBeNull();
  });

  it("treats link-in-bio URLs as no website", () => {
    expect(normalizeWebsiteInput("https://linktr.ee/abc")).toBeNull();
  });

  it("returns null for an unparseable URL", () => {
    expect(normalizeWebsiteInput("http://")).toBeNull();
  });
});
