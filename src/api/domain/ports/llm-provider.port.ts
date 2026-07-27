// Agnostic LLM provider contract. Concrete implementations live in
// src/api/integration/<provider>/ (e.g., gemini/gemini-llm-provider.ts).
// This file must not import anything from integration/, infraestructure/,
// or any specific SDK — see backend-prds/06-porta-llm-provider-gemini.md.

export interface LlmProviderPort {
  generate(prompt: GenerationPrompt): Promise<GenerationResult>;
}

export type GenerationPrompt = {
  systemInstruction: string;
  userContent: string;
  temperature: number;
  maxOutputTokens?: number;
  // Expandable object — new fields can be added here as more
  // providers/capabilities are introduced, without breaking existing
  // implementations that ignore unknown fields.
};

export type GenerationResult = {
  content: string;
  tokensInput: number;
  tokensOutput: number;
  tokensReasoning: number;
};
