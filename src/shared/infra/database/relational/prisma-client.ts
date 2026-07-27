// Client Prisma único, compartilhado por todas as *RepositoryImpl.
// O schema ainda não tem models (ver prisma/schema.prisma) — este arquivo
// só existe para que as implementações de repositório, quando escritas,
// importem uma única instância em vez de criar um PrismaClient cada uma.

import { PrismaClient } from "../../../../../generated/prisma";

export const prisma = new PrismaClient();
