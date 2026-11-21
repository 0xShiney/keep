import type { z } from "zod";
import { AppError, badRequest } from "@/lib/errors";
import { requireJsonBody } from "@/lib/http/request";

/** Parses and validates a JSON request body, producing field-level problems. */
export async function parseJson<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  requireJsonBody(request);

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw badRequest("The request body is not valid JSON");
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const errors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.length > 0 ? issue.path.join(".") : "body";
      errors[key] = [...(errors[key] ?? []), issue.message];
    }
    throw new AppError(
      400,
      "Validation failed",
      "One or more fields are invalid.",
      "about:blank",
      errors,
    );
  }

  return parsed.data;
}
