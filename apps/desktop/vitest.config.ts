import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@lbf/desktop",
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
