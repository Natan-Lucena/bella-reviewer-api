import dotenv from "dotenv";
import { z } from "zod";

// Loads .env into process.env for every entry point (tsx dev server,
// vitest, compiled dist/) — without this, only tools that bundle their own
// dotenv loading (e.g. the Prisma CLI, or PrismaClient's internal env
// lookup) would ever see these variables, which is not something this
// module should rely on as a side effect. No-ops safely if .env is absent
// (e.g. in production, where the platform injects env vars directly).
dotenv.config();

// Fail fast at startup if any required variable is missing/invalid — never
// at runtime.
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  MASTER_KEY: z.string().min(1, "MASTER_KEY is required"),
  SESSION_SECRET: z.string().min(1, "SESSION_SECRET is required"),
  FRONTEND_ORIGIN: z.string().url().default("http://localhost:3001"),
  // Defaults applied to a new Repo's RepoConfig on creation.
  DEFAULT_LLM_MODEL: z.string().default("gemini-2.5-flash"),
  DEFAULT_TOKEN_LIMIT: z.coerce.number().int().positive().default(100000),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;
