import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "../../..");
const SHARED_FILES = ["ai/provider-chain.ts", "ai/extract-json.ts"];

describe("supabase/functions/_shared/core copies", () => {
  it.each(SHARED_FILES)("%s is identical to the packages/core source (run `pnpm sync:edge`)", (file) => {
    const source = readFileSync(join(root, "packages/core/src", file), "utf8");
    const copy = readFileSync(join(root, "supabase/functions/_shared/core", file.split("/").pop()!), "utf8");
    expect(copy).toBe(source);
  });
});
