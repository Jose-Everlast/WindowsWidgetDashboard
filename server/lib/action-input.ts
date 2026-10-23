// Collector actions get browser input: parse it strictly, a mismatch is the caller's error (400).
import { z } from "zod";
import { HttpError } from "../http";

export function parseActionInput<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new HttpError(400, z.prettifyError(parsed.error));
  return parsed.data;
}
