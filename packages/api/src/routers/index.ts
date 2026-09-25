import { publicProcedure, router } from "../index";
import { activitiesRouter } from "./activities";
import { analyticsRouter } from "./analytics";
import { bookingsRouter } from "./bookings";
import { chatRouter } from "./chat";
import { policyRouter } from "./policy";
import { receiptsRouter } from "./receipts";
import { propertiesRouter } from "./properties";
import { roomsRouter } from "./rooms";
import { uploadsRouter } from "./uploads";

export const appRouter = router({
  healthCheck: publicProcedure.query(() => {
    return "OK";
  }),
  properties: propertiesRouter,
  rooms: roomsRouter,
  activities: activitiesRouter,
  bookings: bookingsRouter,
  chat: chatRouter,
  analytics: analyticsRouter,
  uploads: uploadsRouter,
  policy: policyRouter,
  receipts: receiptsRouter,
});
export type AppRouter = typeof appRouter;
