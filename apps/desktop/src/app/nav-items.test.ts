import { describe, expect, it } from "vitest";
import { navItems } from "./nav-items";

describe("navItems", () => {
  it("has the 12 sidebar pages of the design reference plus the draft review page (ADR 0018)", () => {
    expect(navItems).toHaveLength(13);
    expect(navItems.find((item) => item.path === "/review")?.badge).toBe("pendingApproval");
  });

  it("has unique paths", () => {
    const paths = navItems.map((item) => item.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("starts with the dashboard as the root route", () => {
    expect(navItems[0]?.path).toBe("/");
  });

  it("puts team, knowledge base and settings in the workspace group at the end", () => {
    expect(navItems.slice(-3).map((item) => item.group)).toEqual(["workspace", "workspace", "workspace"]);
    expect(navItems.slice(0, -3).every((item) => item.group === "main")).toBe(true);
  });
});
