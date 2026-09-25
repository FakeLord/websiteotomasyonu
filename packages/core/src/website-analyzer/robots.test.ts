import { describe, expect, it } from "vitest";
import { isPathAllowed } from "./robots";

describe("isPathAllowed", () => {
  it("allows everything when robots.txt is empty", () => {
    expect(isPathAllowed("", "/iletisim")).toBe(true);
  });

  it("disallows a path blocked for User-agent: *", () => {
    const robots = "User-agent: *\nDisallow: /iletisim";
    expect(isPathAllowed(robots, "/iletisim")).toBe(false);
  });

  it("allows a path not covered by any Disallow rule", () => {
    const robots = "User-agent: *\nDisallow: /admin";
    expect(isPathAllowed(robots, "/iletisim")).toBe(true);
  });

  it("treats an empty Disallow value as allow-all", () => {
    const robots = "User-agent: *\nDisallow:";
    expect(isPathAllowed(robots, "/iletisim")).toBe(true);
  });

  it("ignores rules under an unrelated bot's group", () => {
    const robots = "User-agent: Googlebot\nDisallow: /iletisim";
    expect(isPathAllowed(robots, "/iletisim", "LocalBusinessFinderBot")).toBe(true);
  });

  it("respects a rule scoped to our own bot name", () => {
    const robots = "User-agent: LocalBusinessFinderBot\nDisallow: /iletisim";
    expect(isPathAllowed(robots, "/iletisim", "LocalBusinessFinderBot")).toBe(false);
  });

  it("matches Disallow as a path prefix", () => {
    const robots = "User-agent: *\nDisallow: /private";
    expect(isPathAllowed(robots, "/private/contact")).toBe(false);
  });

  it("ignores comments", () => {
    const robots = "# comment\nUser-agent: *\nDisallow: /iletisim # also a comment";
    expect(isPathAllowed(robots, "/iletisim")).toBe(false);
  });
});
