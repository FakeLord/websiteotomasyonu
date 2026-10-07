import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@lbf/local-server",
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
