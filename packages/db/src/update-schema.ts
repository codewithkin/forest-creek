import { z } from "zod";

/**
 * The fields of a create schema, every one optional and WITHOUT its default:
 * what an update takes. Import-free apart from zod.
 *
 * `.partial()` alone keeps each field's `.default()`, so an update that sends
 * only some fields wrote the defaults over the rest. Found live: marking a
 * dish sold out set its price to "Ask", and hiding a property would have
 * emptied its gallery and amenities and reset its order.
 */
type WithoutDefaults<Shape extends z.ZodRawShape> = {
  [K in keyof Shape]: Shape[K] extends z.ZodDefault<infer Inner> ? Inner : Shape[K];
};

export function updatesOf<Shape extends z.ZodRawShape>(schema: z.ZodObject<Shape>) {
  const shape = Object.fromEntries(
    Object.entries(schema.shape).map(([key, field]) => [key, field instanceof z.ZodDefault ? field.unwrap() : field]),
  ) as WithoutDefaults<Shape>;
  return z.object(shape).partial();
}
