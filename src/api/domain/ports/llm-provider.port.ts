// Contrato agnóstico de provedor de LLM. Implementações concretas ficam em
// src/api/integration/<provedor>/ (ex.: gemini/gemini-llm-provider.ts).
// Este arquivo não deve importar nada de integration/, infraestructure/ ou
// qualquer SDK específico — ver backend-prds/06-porta-llm-provider-gemini.md.

export interface LlmProviderPort {
  generate(prompt: GenerationPrompt): Promise<GenerationResult>;
}

export type GenerationPrompt = {
  systemInstruction: string;
  userContent: string;
  temperature: number;
  maxOutputTokens?: number;
  // Objeto expansível — novos campos podem ser adicionados aqui conforme
  // mais provedores/capacidades entrarem, sem quebrar implementações
  // existentes que ignoram campos desconhecidos.
};

export type GenerationResult = {
  content: string;
  tokensInput: number;
  tokensOutput: number;
  tokensReasoning: number;
};
