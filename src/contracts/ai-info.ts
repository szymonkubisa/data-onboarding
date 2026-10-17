/** What the browser may know about the AI setup. Never includes the key. */
export interface AiInfo {
  mode: "live" | "demo";
  /** OpenRouter model id in live mode, null in demo mode. */
  model: string | null;
}
