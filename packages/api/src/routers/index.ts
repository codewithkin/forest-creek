import { publicProcedure, router } from "../index";
import { activitiesRouter } from "./activities";
import { roomsRouter } from "./rooms";

export const appRouter = router({
  healthCheck: publicProcedure.query(() => {
    return "OK";
  }),
  rooms: roomsRouter,
  activities: activitiesRouter,
});
export type AppRouter = typeof appRouter;
