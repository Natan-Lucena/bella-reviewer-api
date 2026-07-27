import { z } from "zod";

export const setScmCredentialSchema = z.object({
  pat: z.string().min(1, "pat is required"),
});

export type SetScmCredentialInput = z.infer<typeof setScmCredentialSchema>;
