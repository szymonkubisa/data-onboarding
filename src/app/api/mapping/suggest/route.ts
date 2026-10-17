import { SuggestRequestSchema } from "@/contracts/mapping-api";
import { isSchemaId } from "@/domain/schema/registry";
import { getAiConfig } from "@/infrastructure/ai/config";
import { startMapping } from "@/infrastructure/ai/graph/run";
import { HeuristicSuggester } from "@/infrastructure/ai/heuristic-suggester";
import { OpenRouterSuggester } from "@/infrastructure/ai/openrouter-suggester";
import { clientKey, RateLimiter } from "@/infrastructure/ai/rate-limit";
import { errorResponse, logEvent, readJson } from "../http";

// Node.js runtime is the default (and the `runtime` export is rejected with Cache Components).
export const maxDuration = 30;

const limiter = new RateLimiter(20, 60_000);

/** Start a mapping thread: analyse → suggest (LLM or heuristics) → validate → pause for review. */
export async function POST(request: Request) {
  const wait = limiter.check(clientKey(request));
  if (wait > 0) {
    return errorResponse(429, "rate-limited", `Too many requests. Try again in ${wait}s.`, {
      "retry-after": String(wait),
    });
  }

  const body = await readJson(request, SuggestRequestSchema);
  if (!body.ok) return body.response;
  if (!isSchemaId(body.data.schemaId)) {
    return errorResponse(400, "unknown-schema", "Unknown target schema.");
  }

  const config = getAiConfig();
  const suggester =
    config.mode === "live" && config.apiKey
      ? new OpenRouterSuggester({
          apiKey: config.apiKey,
          model: config.model,
          baseURL: config.baseURL,
        })
      : new HeuristicSuggester();

  const started = Date.now();
  try {
    const { response, stats } = await startMapping({
      request: body.data,
      suggester,
      signal: AbortSignal.timeout(25_000),
    });
    logEvent("mapping.suggest", {
      columns: body.data.profile.length,
      samples: Boolean(body.data.samples),
      origin: response.origin,
      fallbackReason: response.fallbackReason,
      attempts: stats.attempts,
      repairs: stats.repairs,
      ms: Date.now() - started,
    });
    return Response.json(response);
  } catch (error) {
    logEvent("mapping.suggest.error", {
      error: error instanceof Error ? error.name : "unknown",
      ms: Date.now() - started,
    });
    return errorResponse(500, "suggest-failed", "Could not generate suggestions. Try again.");
  }
}
