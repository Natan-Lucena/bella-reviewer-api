import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    // Integration tests (*.integration.spec.ts) make real network calls
    // (e.g., Gemini) and cost money/time — they only run via
    // `pnpm test:integration`. See backend-prds/14-teste-integracao-modo-lote.md.
    coverage: {
      provider: "v8",
      // json-summary is what CI's coverage-report-action reads
      // (coverage/coverage-summary.json).
      reporter: ["text", "json-summary", "json"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.spec.ts", "src/**/*.integration.spec.ts", "src/index.ts"],
    },
  },
});
