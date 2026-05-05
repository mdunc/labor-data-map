import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    environmentMatchGlobs: [["tests/integration.test.ts", "jsdom"]],
    include: ["tests/**/*.test.ts"],
  },
});
