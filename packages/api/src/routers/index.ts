import { publicProcedure, router } from "../index";
import { activitiesRouter } from "./activities";
import { bookingsRouter } from "./bookings";
import { chatRouter } from "./chat";
import { roomsRouter } from "./rooms";

export const appRouter = router({
  healthCheck: publicProcedure.query(() => {
    return "OK";
  }),
  rooms: roomsRouter,
  activities: activitiesRouter,
  bookings: bookingsRouter,
  chat: chatRouter,
});
export type AppRouter = typeof appRouter;
