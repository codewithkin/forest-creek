import { forgetFile, getFilesToPurge } from "@forest-creek/db";
import { describeError } from "@forest-creek/db/log";
import { deleteStoredFile, isStorageConfigured } from "@forest-creek/storage";

/**
 * Removes what the file store no longer needs from R2: the trash after its 30
 * days, and uploads nobody finished. The record goes only once the object has,
 * so a failed delete is simply tried again on the next run.
 */
export async function purgeFiles(): Promise<number> {
  if (!isStorageConfigured()) return 0;
  let purged = 0;
  for (const file of await getFilesToPurge()) {
    try {
      await deleteStoredFile(file.key);
      await forgetFile(file.id);
      purged++;
    } catch (error) {
      console.error(`[files] could not purge file ${file.id}: ${describeError(error)}`);
    }
  }
  return purged;
}
