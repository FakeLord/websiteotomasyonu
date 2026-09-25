import { describe, expect, it } from "vitest";
import { exampleWorkspaceNameSchema } from "./index";

describe("exampleWorkspaceNameSchema", () => {
  it("accepts a non-empty string", () => {
    expect(exampleWorkspaceNameSchema.parse("Ajans A")).toBe("Ajans A");
  });

  it("rejects an empty string", () => {
    expect(() => exampleWorkspaceNameSchema.parse("")).toThrow();
  });
});
