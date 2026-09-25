import { describe, expect, it } from "vitest";
import { navItems } from "./nav-items";

describe("navItems", () => {
  it("has exactly the 9 MVP sidebar pages", () => {
    expect(navItems).toHaveLength(9);
  });

  it("has unique paths", () => {
    const paths = navItems.map((item) => item.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("starts with the dashboard as the root route", () => {
    expect(navItems[0]?.path).toBe("/");
  });
});
