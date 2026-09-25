import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@lbf/providers",
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
