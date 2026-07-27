import { describe, expect, it } from "vitest";

import { err, ok } from "./result";

// Teste de exemplo — prova que o setup do Vitest funciona. Os testes reais
// de cada caso de uso ficam junto da implementação, conforme os critérios
// de aceite de cada PRD em ../../../../backend-prds/.
describe("Result", () => {
  it("ok() produz um resultado de sucesso", () => {
    const result = ok(42);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(42);
    }
  });

  it("err() produz um resultado de erro", () => {
    const result = err("algo deu errado");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("algo deu errado");
    }
  });
});
