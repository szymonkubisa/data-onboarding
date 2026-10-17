import "server-only";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { buildLlmOutputJsonSchema } from "@/domain/mapping/schemas";
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
}

/** Output budget grows with the number of columns: roughly one short sentence each. */
export function maxTokensFor(columnCount: number): number {
  return Math.min(8192, 512 + columnCount * 64);
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
      timeout: this.options.timeoutMs ?? 25_000,
      configuration: {
        baseURL: this.options.baseURL,
        defaultHeaders: { "X-Title": "Data Onboarding" },
      },
    });
  }

  async suggest(input: SuggestInput, { signal }: { signal?: AbortSignal } = {}): Promise<unknown> {
    const schema = buildLlmOutputJsonSchema(
      input.columns.map((c) => c.id),
      input.schema.fields.map((f) => f.key),
    );
    const structured = this.chatModel(input.columns.length).withStructuredOutput(schema, {
      name: "column_mapping",
      method: this.options.method ?? "jsonSchema",
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
  // Provider messages can echo request details; keep only the class and status.
  const status =
    typeof error === "object" && error && "status" in error ? ` (${String(error.status)})` : "";
  const name = error instanceof Error ? error.name : "UnknownError";
  return new SuggesterError("provider", `Model provider error: ${name}${status}.`);
}
