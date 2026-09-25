import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@lbf/contracts",
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
