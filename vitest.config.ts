import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/test/**/*.test.ts", "apps/server/test/**/*.test.ts", "apps/phone/test/**/*.test.ts", "pipeline/test/**/*.test.ts"],
  },
});
