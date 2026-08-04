import { z } from "zod";

export const installActionSchema = z.object({
  pat: z.string().min(1, "pat is required"),
});

export type InstallActionInput = z.infer<typeof installActionSchema>;
