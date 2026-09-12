export { createPrismaClient, prisma } from "./client";
export type { PrismaClient } from "./client";

export * from "./domain";
export * from "./rooms";
export * from "./activities";

export { prisma as default } from "./client";
