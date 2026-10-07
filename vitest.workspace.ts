import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  "packages/*/vitest.config.ts",
  "apps/desktop/vitest.config.ts",
  "apps/local-server/vitest.config.ts",
]);
