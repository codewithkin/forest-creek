/**
 * Import-free, so it can be unit tested without the validated environment.
 */

/**
 * A tool map keyed by each tool's own id. Mastra offers the model a tool under
 * its KEY in this map, not its id — keyed by camelCase names, the model was
 * offered "createBooking" while every prompt and tool description told it to
 * call "create-booking". Keyed by id, the name the model sees is the name the
 * instructions use.
 */
export function toolset<T extends { id: string }>(tools: readonly T[]): Record<string, T> {
  const byId: Record<string, T> = {};
  for (const tool of tools) {
    if (byId[tool.id]) throw new Error(`Two tools share the id "${tool.id}"`);
    byId[tool.id] = tool;
  }
  return byId;
}
