import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@lbf/core",
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
