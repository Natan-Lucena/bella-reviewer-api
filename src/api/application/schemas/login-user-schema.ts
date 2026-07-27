import { z } from "zod";

export const loginUserSchema = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
});

export type LoginUserInput = z.infer<typeof loginUserSchema>;
