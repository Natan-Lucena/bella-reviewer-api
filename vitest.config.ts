import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    // Testes de integração (*.integration.spec.ts) fazem chamadas de rede reais
    // (ex.: Gemini) e custam dinheiro/tempo — rodam só via `pnpm test:integration`.
    // Ver backend-prds/14-teste-integracao-modo-lote.md.
  },
});
