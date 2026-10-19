import type { z } from "zod";
import { MAX_REQUEST_BYTES, type ApiErrorBody } from "@/contracts/mapping-api";

export function errorResponse(
  status: number,
  code: string,
  message: string,
  headers?: HeadersInit,
) {
  const body: ApiErrorBody = { error: { code, message } };
  return Response.json(body, { status, headers });
}

/**
 * Read a JSON body with a size cap and validate it. Returns the parsed data or a ready
 * error response. Validation messages name fields, never echo values.
 */
export async function readJson<S extends z.ZodType>(
  request: Request,
  schema: S,
): Promise<{ ok: true; data: z.infer<S> } | { ok: false; response: Response }> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_REQUEST_BYTES) {
    return {
      ok: false,
      response: errorResponse(413, "payload-too-large", "The request body is too large."),
    };
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_REQUEST_BYTES) {
    return {
      ok: false,
      response: errorResponse(413, "payload-too-large", "The request body is too large."),
    };
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return {
      ok: false,
      response: errorResponse(400, "invalid-json", "The request body is not valid JSON."),
    };
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    const where = parsed.error.issues
      .slice(0, 3)
      .map((i) => i.path.join(".") || "body")
      .join(", ");
    return {
      ok: false,
      response: errorResponse(400, "invalid-request", `Invalid request: check ${where}.`),
    };
  }
  return { ok: true, data: parsed.data };
}

/** Structured log line with counts and codes only. No values, headers or samples. */
export function logEvent(event: string, fields: Record<string, string | number | boolean | null>) {
  console.info(JSON.stringify({ event, ...fields }));
}
