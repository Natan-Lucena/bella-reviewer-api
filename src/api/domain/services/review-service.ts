// Núcleo puro de revisão — regra inegociável (ver
// backend-prds/10-nucleo-review-service.md): este arquivo NÃO PODE importar
// nada de @prisma/client, express, ou de src/api/integration/*. Só conhece
// os tipos abaixo e a interface LlmProviderPort. Implementação real fica
// para quem for executar o PRD 10 — este arquivo é só o contrato/assinatura.

import type { LlmProviderPort } from "../ports/llm-provider.port";
import type { Diff } from "../ports/scm-adapter.port";

export type ContextoRevisao = {
  limiteTokensExecucao: number;
  temperatura: number;
  categoriasHabilitadas: string[]; // vazio = todas habilitadas
};

export type Comentario = {
  arquivo: string;
  linha: number;
  categoria: string;
  severidade: "baixa" | "media" | "alta" | "critica";
  corpo: string;
};

export type TurnoResultado = {
  indice: number;
  tokensInput: number;
  tokensOutput: number;
  tokensReasoning: number;
  comentarios: Comentario[];
  erroMotivo?: string;
};

export type ResultadoRevisao = {
  comentarios: Comentario[];
  turnos: TurnoResultado[];
  falhaTotal?: { motivo: string };
};

export async function review(
  _diff: Diff,
  _contexto: ContextoRevisao,
  _ports: { llmProvider: LlmProviderPort },
): Promise<ResultadoRevisao> {
  throw new Error("not implemented — ver backend-prds/10-nucleo-review-service.md");
}
