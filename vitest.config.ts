import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    // Integration tests (*.integration.spec.ts) make real network calls
    // (e.g., Gemini) and cost money/time — they only run via
    // `pnpm test:integration`. See backend-prds/14-teste-integracao-modo-lote.md.
  },
});
