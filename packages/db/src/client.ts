import { env } from "@forest-creek/env/server";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../prisma/generated/client";

export function createPrismaClient() {
  const adapter = new PrismaPg({
    connectionString: env.DATABASE_URL,
  });
  return new PrismaClient({ adapter });
}

// `bun run --hot` re-evaluates this module on every edit, so without a global
// cache each reload would leak another connection pool.
const globalForPrisma = globalThis as { __forestCreekPrisma?: PrismaClient };

export const prisma = globalForPrisma.__forestCreekPrisma ?? createPrismaClient();

if (env.NODE_ENV !== "production") {
  globalForPrisma.__forestCreekPrisma = prisma;
}

export type { PrismaClient };
