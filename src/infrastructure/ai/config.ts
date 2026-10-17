import "server-only";
import { z } from "zod";
import type { AiInfo } from "@/contracts/ai-info";

/** Cheap, fast, supports structured output on OpenRouter. Override with OPENROUTER_MODEL. */
export const DEFAULT_MODEL = "anthropic/claude-haiku-5.5";
export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

const EnvSchema = z.object({
  OPENROUTER_API_KEY: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || undefined),
  OPENROUTER_MODEL: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || DEFAULT_MODEL),
});

export interface AiConfig {
  mode: AiInfo["mode"];
  model: string;
  apiKey: string | undefined;
  baseURL: string;
}

/** Read AI settings from the environment. No key → demo mode (heuristics, no LLM). */
export function getAiConfig(env: Record<string, string | undefined> = process.env): AiConfig {
  const parsed = EnvSchema.parse({
    OPENROUTER_API_KEY: env.OPENROUTER_API_KEY,
    OPENROUTER_MODEL: env.OPENROUTER_MODEL,
  });
  return {
    mode: parsed.OPENROUTER_API_KEY ? "live" : "demo",
    model: parsed.OPENROUTER_MODEL,
    apiKey: parsed.OPENROUTER_API_KEY,
    baseURL: OPENROUTER_BASE_URL,
  };
}

/** The subset that is safe to render in the browser. */
export function publicAiInfo(env?: Record<string, string | undefined>): AiInfo {
  const config = getAiConfig(env);
  return { mode: config.mode, model: config.mode === "live" ? config.model : null };
}
