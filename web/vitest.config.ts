import { defineConfig } from "vitest/config";
export default defineConfig({
  test: { include: ["tests/**/*.test.ts"], env: { DEV_AUTH_ENABLED: "true" } },
});
