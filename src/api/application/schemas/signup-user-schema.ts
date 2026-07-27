import { z } from "zod";

export const signupUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export type SignupUserInput = z.infer<typeof signupUserSchema>;
