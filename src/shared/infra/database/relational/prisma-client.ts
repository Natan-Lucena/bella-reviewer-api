// Single Prisma client, shared by every *RepositoryImpl. The schema doesn't
// have models yet (see prisma/schema.prisma) — this file exists so that
// repository implementations, once written, import one shared instance
// instead of each creating its own PrismaClient.

import { PrismaClient } from "../../../../../generated/prisma";

export const prisma = new PrismaClient();
