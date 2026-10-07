import { describe, expect, it } from "vitest";
import { parseOtpLink } from "./otp-link";

describe("parseOtpLink", () => {
  it("reads token_hash and type from the hash-router query string", () => {
    expect(parseOtpLink("?token_hash=abc123&type=invite")).toEqual({ tokenHash: "abc123", type: "invite" });
    expect(parseOtpLink("?type=recovery&token_hash=xyz")).toEqual({ tokenHash: "xyz", type: "recovery" });
  });

  it("returns null when the token is missing or empty", () => {
    expect(parseOtpLink("?type=invite")).toBeNull();
    expect(parseOtpLink("?token_hash=&type=invite")).toBeNull();
    expect(parseOtpLink("")).toBeNull();
  });

  it("returns null for link types the app does not handle", () => {
    expect(parseOtpLink("?token_hash=abc&type=signup")).toBeNull();
    expect(parseOtpLink("?token_hash=abc")).toBeNull();
  });
});
