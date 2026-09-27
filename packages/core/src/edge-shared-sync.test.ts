import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "../../..");
const copyDir = join(root, "supabase/functions/_shared/core");
const copies = readdirSync(copyDir).filter((file) => file.endsWith(".ts"));

describe("supabase/functions/_shared/core copies", () => {
  it("contains the synced files", () => {
    expect(copies.length).toBeGreaterThan(0);
  });

  it.each(copies)("%s is identical to its packages/core/src/ai source (run `pnpm sync:edge`)", (file) => {
    const source = readFileSync(join(root, "packages/core/src/ai", file), "utf8");
    const copy = readFileSync(join(copyDir, file), "utf8");
    expect(copy).toBe(source);
  });
});
