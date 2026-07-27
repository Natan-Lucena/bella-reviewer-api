import { z } from "zod";

export const setLlmCredentialSchema = z.object({
  apiKey: z.string().min(1, "apiKey is required"),
});

export type SetLlmCredentialInput = z.infer<typeof setLlmCredentialSchema>;
