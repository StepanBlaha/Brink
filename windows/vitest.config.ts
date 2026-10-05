import { defineConfig } from "vitest/config";

// Natural-date tests depend on the zone (plan 6.1); workers inherit it.
process.env["TZ"] = "Europe/Prague";

export default defineConfig({
  // `legal/*.md` sits above the project root.
  server: { fs: { allow: [".."] } },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["src/test/setup.ts"],
  },
});
