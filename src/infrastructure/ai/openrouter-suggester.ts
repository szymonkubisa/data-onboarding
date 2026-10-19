import "server-only";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { buildLlmOutputSchema } from "@/domain/mapping/schemas";
import { buildMappingUserPrompt, MAPPING_SYSTEM_PROMPT } from "./prompts/mapping";
import { SuggesterError, type MappingSuggester, type SuggestInput } from "./suggester";

export interface OpenRouterOptions {
  apiKey: string;
  model: string;
  baseURL: string;
  timeoutMs?: number;
  /** Injected in tests (FakeListChatModel). Defaults to ChatOpenAI pointed at OpenRouter. */
  chatModel?: BaseChatModel;
  /** "jsonSchema" for providers that enforce a response schema; "functionCalling" otherwise. */
  method?: "jsonSchema" | "functionCalling";
  /** HTTP override, for tests that inspect the exact request sent to OpenRouter. */
  fetch?: typeof fetch;
  /** OpenRouter's unified `reasoning.effort`; "off" (or unset) sends no reasoning parameter. */
  reasoningEffort?: "off" | "minimal" | "low" | "medium" | "high";
}

/**
 * Token budget grows with the number of columns (one short sentence each). Reasoning models
 * spend part of `max_tokens` on thinking, hence the generous base.
 */
export function maxTokensFor(columnCount: number): number {
  return Math.min(16_384, 2_048 + columnCount * 96);
}

/**
 * LLM suggester: ChatOpenAI with OpenRouter's OpenAI-compatible endpoint and structured
 * output. Chosen over @langchain/openrouter 0.x because this path is stable and widely used.
 */
export class OpenRouterSuggester implements MappingSuggester {
  readonly origin = "llm" as const;
  readonly model: string;

  constructor(private readonly options: OpenRouterOptions) {
    this.model = options.model;
  }

  private chatModel(columnCount: number): BaseChatModel {
    if (this.options.chatModel) return this.options.chatModel;
    return new ChatOpenAI({
      model: this.options.model,
      apiKey: this.options.apiKey,
      temperature: 0,
      maxRetries: 1,
      maxTokens: maxTokensFor(columnCount),
      // The graph gives each attempt its own abort signal; this is only a hard ceiling.
      timeout: this.options.timeoutMs ?? 60_000,
      ...(this.options.reasoningEffort && this.options.reasoningEffort !== "off"
        ? { modelKwargs: { reasoning: { effort: this.options.reasoningEffort } } }
        : {}),
      configuration: {
        baseURL: this.options.baseURL,
        defaultHeaders: { "X-Title": "Data Onboarding" },
        ...(this.options.fetch ? { fetch: this.options.fetch } : {}),
      },
    });
  }

  async suggest(input: SuggestInput, { signal }: { signal?: AbortSignal } = {}): Promise<unknown> {
    const schema = buildLlmOutputSchema(
      input.columns.map((c) => c.id),
      input.schema.fields.map((f) => f.key),
    );
    const structured = this.chatModel(input.columns.length).withStructuredOutput(schema, {
      name: "column_mapping",
      method: this.options.method ?? "jsonSchema",
      strict: true,
    });
    try {
      return await structured.invoke(
        [new SystemMessage(MAPPING_SYSTEM_PROMPT), new HumanMessage(buildMappingUserPrompt(input))],
        { signal },
      );
    } catch (error) {
      throw classify(error, signal);
    }
  }
}

function classify(error: unknown, signal?: AbortSignal): SuggesterError {
  if (signal?.aborted || (error instanceof Error && /abort|timeout/i.test(error.name))) {
    return new SuggesterError("timeout", "The model did not answer in time.");
  }
  if (
    error instanceof SyntaxError ||
    (error instanceof Error && error.name === "OutputParserException")
  ) {
    return new SuggesterError("invalid-output", "The answer was not valid JSON.");
  }
  return new SuggesterError("provider", describeProviderError(error));
}

/**
 * Server-log description of a provider failure: error class, HTTP status, the provider's
 * error code and offending parameter, and the first part of its message. Provider messages
 * describe the request parameters (model, temperature, response_format), not row data, which
 * never reaches the server in the first place.
 */
export function describeProviderError(error: unknown): string {
  const e = (typeof error === "object" && error ? error : {}) as Record<string, unknown>;
  const name = error instanceof Error ? error.name : "UnknownError";
  const parts = [
    e.status,
    e.code && `code=${String(e.code)}`,
    e.param && `param=${String(e.param)}`,
  ]
    .filter(Boolean)
    .map(String);
  // OpenRouter wraps upstream failures as "Provider returned error"; the upstream reason is in
  // error.metadata.raw, and which provider answered in error.metadata.provider_name.
  const body = (e.error ?? {}) as { metadata?: { raw?: unknown; provider_name?: unknown } };
  const upstream = body.metadata?.raw
    ? ` [${String(body.metadata.provider_name ?? "upstream")}: ${String(body.metadata.raw)}]`
    : "";
  const message = error instanceof Error ? error.message : "";
  const text = `${message}${upstream}`.replace(/\s+/g, " ").slice(0, 400);
  return `Model provider error: ${name}${parts.length ? ` (${parts.join(", ")})` : ""}${text ? `: ${text}` : "."}`;
}
