import { publicProcedure, router } from "../index";
import { activitiesRouter } from "./activities";
import { analyticsRouter } from "./analytics";
import { bookingsRouter } from "./bookings";
import { chatRouter } from "./chat";
import { dayVisitsRouter } from "./day-visits";
import { filesRouter } from "./files";
import { policyRouter } from "./policy";
import { invoicesRouter } from "./invoices";
import { quotesRouter } from "./quotes";
import { receiptsRouter } from "./receipts";
import { reportsRouter } from "./reports";
import { propertiesRouter } from "./properties";
import { roomsRouter } from "./rooms";
import { trendsRouter } from "./trends";
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
  dayVisits: dayVisitsRouter,
  quotes: quotesRouter,
  invoices: invoicesRouter,
  files: filesRouter,
  reports: reportsRouter,
  trends: trendsRouter,
});
export type AppRouter = typeof appRouter;
