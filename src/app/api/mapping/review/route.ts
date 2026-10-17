import { ReviewRequestSchema } from "@/contracts/mapping-api";
import { isSchemaId } from "@/domain/schema/registry";
import { resumeMapping } from "@/infrastructure/ai/graph/run";
import { clientKey, RateLimiter } from "@/infrastructure/ai/rate-limit";
import { errorResponse, logEvent, readJson } from "../http";

export const runtime = "nodejs";
export const maxDuration = 30;

const limiter = new RateLimiter(60, 60_000);

/** Resume the mapping thread with the person's decisions; rehydrate it if this instance lost it. */
export async function POST(request: Request) {
  const wait = limiter.check(clientKey(request));
  if (wait > 0) {
    return errorResponse(429, "rate-limited", `Too many requests. Try again in ${wait}s.`, {
      "retry-after": String(wait),
    });
  }

  const body = await readJson(request, ReviewRequestSchema);
  if (!body.ok) return body.response;
  if (!isSchemaId(body.data.schemaId)) {
    return errorResponse(400, "unknown-schema", "Unknown target schema.");
  }

  const started = Date.now();
  try {
    const response = await resumeMapping({ request: body.data });
    logEvent("mapping.review", {
      columns: body.data.decisions.length,
      status: response.status,
      issues: response.status === "needs-changes" ? response.issues.length : 0,
      rehydrated: response.rehydrated,
      ms: Date.now() - started,
    });
    return Response.json(response);
  } catch (error) {
    logEvent("mapping.review.error", {
      error: error instanceof Error ? error.name : "unknown",
      ms: Date.now() - started,
    });
    return errorResponse(500, "review-failed", "Could not check the mapping. Try again.");
  }
}
