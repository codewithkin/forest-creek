import { createUploadTarget, isStorageConfigured, uploadRequestSchema } from "@forest-creek/storage";
import { TRPCError } from "@trpc/server";

import { router, staffProcedure } from "../index";

export const uploadsRouter = router({
  /** Lets the dashboard hide upload controls instead of offering a broken one. */
  status: staffProcedure.query(() => ({ configured: isStorageConfigured() })),

  createUploadUrl: staffProcedure.input(uploadRequestSchema).mutation(async ({ input }) => {
    if (!isStorageConfigured()) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Image uploads are not configured. Add the R2 settings to the server environment.",
      });
    }
    return createUploadTarget(input);
  }),
});
