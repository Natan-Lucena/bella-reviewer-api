import { z } from "zod";

// Falha rápido na inicialização se alguma variável obrigatória estiver
// ausente/inválida — nunca em uma chamada de runtime. Ver
// backend-prds/01-shared-cifra-hash-credenciais.md quanto a MASTER_KEY
// especificamente.
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL é obrigatório"),
  MASTER_KEY: z.string().min(1, "MASTER_KEY é obrigatório"),
  SESSION_SECRET: z.string().min(1, "SESSION_SECRET é obrigatório"),
  FRONTEND_ORIGIN: z.string().url().default("http://localhost:3001"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Configuração de ambiente inválida:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;
