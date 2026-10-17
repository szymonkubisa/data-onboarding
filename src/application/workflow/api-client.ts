import type { z } from "zod";
import {
  ApiErrorSchema,
  ReviewResponseSchema,
  SuggestResponseSchema,
  type ReviewRequest,
  type ReviewResponse,
  type SuggestRequest,
  type SuggestResponse,
} from "@/contracts/mapping-api";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function post<S extends z.ZodType>(
  url: string,
  body: unknown,
  schema: S,
  signal?: AbortSignal,
): Promise<z.infer<S>> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError(
      "Could not reach the server. Check your connection and try again.",
      "network",
      0,
    );
  }

  const json: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const parsed = ApiErrorSchema.safeParse(json);
    throw new ApiError(
      parsed.success ? parsed.data.error.message : `The server answered ${response.status}.`,
      parsed.success ? parsed.data.error.code : "http-error",
      response.status,
    );
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new ApiError("The server sent an unexpected response.", "bad-response", response.status);
  }
  return parsed.data;
}

export function postSuggest(body: SuggestRequest, signal?: AbortSignal): Promise<SuggestResponse> {
  return post("/api/mapping/suggest", body, SuggestResponseSchema, signal);
}

export function postReview(body: ReviewRequest, signal?: AbortSignal): Promise<ReviewResponse> {
  return post("/api/mapping/review", body, ReviewResponseSchema, signal);
}
