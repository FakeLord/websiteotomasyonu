/* global console */
// packages/core içindeki import içermeyen saf dosyaları Edge Function'ların
// görebileceği supabase/functions/_shared/core/ altına kopyalar (yerel ve
// deploy edilen edge runtime yalnızca supabase/functions'ı paketler).
// Kopyalar elle düzenlenmez; edge-shared-sync.test.ts sapmayı yakalar.
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const SHARED_FILES = ["ai/provider-chain.ts", "ai/extract-json.ts", "ai/jarvis.ts"];

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const targetDir = join(root, "supabase/functions/_shared/core");

mkdirSync(targetDir, { recursive: true });
for (const file of SHARED_FILES) {
  const target = join(targetDir, file.split("/").pop());
  copyFileSync(join(root, "packages/core/src", file), target);
  console.log(`→ ${file}`);
}
