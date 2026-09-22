export { createPrismaClient, prisma } from "./client";
export type { PrismaClient } from "./client";

export * from "./domain";
export * from "./properties";
export * from "./property-search";
export * from "./rooms";
export * from "./gallery";
export * from "./activities";
export * from "./bookings";
export * from "./payments";
export * from "./chat";
export * from "./analytics";

export { prisma as default } from "./client";
