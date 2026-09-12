import { publicProcedure, router } from "../index";
import { activitiesRouter } from "./activities";
import { bookingsRouter } from "./bookings";
import { roomsRouter } from "./rooms";

export const appRouter = router({
  healthCheck: publicProcedure.query(() => {
    return "OK";
  }),
  rooms: roomsRouter,
  activities: activitiesRouter,
  bookings: bookingsRouter,
});
export type AppRouter = typeof appRouter;
