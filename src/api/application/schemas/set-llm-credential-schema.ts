import { z } from "zod";

export const setLlmCredentialSchema = z.object({
  provider: z.enum(["gemini", "claude", "openai"]),
  apiKey: z.string().min(1, "apiKey is required"),
  // Omitted = use the catalog's default model for the chosen provider (see
  // getDefaultModelForProvider) — covers the wizard flow, which doesn't ask
  // for a model explicitly.
  model: z.string().min(1).optional(),
});

export type SetLlmCredentialInput = z.infer<typeof setLlmCredentialSchema>;
