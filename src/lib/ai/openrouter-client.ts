/**
 * Feedback model client for Stella.
 *
 * Speaks the OpenAI-compatible chat-completions protocol, so it works with
 * OpenRouter or any other gateway exposing the same shape. Both the gateway
 * and the model are server-side configuration — never sent from the browser.
 */

import { STELLA_SYSTEM_INSTRUCTION } from "./prompts/stella-prompt";

/**
 * Default feedback model.
 *
 * Deliberately NOT a "-contributor" tier. Those tiers are cheaper because the
 * provider uses the prompts to improve its products, and our prompts contain
 * students' transcribed speech. Never make a contributor tier the default.
 *
 * Grok 4.6 is a flagship-class reasoning model. Band judgements need
 * consistency across four criteria and up to 20 answers in one object, which
 * is exactly where stronger reasoning shows up. Override with OPENROUTER_MODEL.
 */
export const DEFAULT_FEEDBACK_MODEL = "x-ai/grok-4.6";

/** Default gateway. Override with OPENROUTER_BASE_URL for another provider. */
const DEFAULT_API_BASE = "https://openrouter.ai/api/v1";

/**
 * Hard ceiling on completion length.
 *
 * This is a safety limit, not a budget: providers bill only for tokens actually
 * generated, so a high ceiling costs nothing on short answers. It exists to
 * stop a runaway response.
 *
 * It must leave room for TWO things, not one. Reasoning models count their
 * internal reasoning tokens as completion tokens, so a hard mock can burn a
 * real share of the cap before the first character of JSON is emitted. Sizing
 * this to the JSON alone is how you get a truncated object on exactly the
 * submissions that matter most.
 *
 * Keep this comfortably above MAX_ANALYSIS_OUTPUT_TOKENS in scope-guard.ts,
 * and below the model's own max output (Grok 4.6: 65,536).
 */
const MAX_COMPLETION_TOKENS = 32000;

/**
 * How hard the model should think before answering.
 *
 * The effort field is ALWAYS sent. Omitting it is not the same as asking for
 * less: a reasoning-enforcing model then applies its own default, which can be
 * a long pass, so "send nothing" is the one option that makes latency
 * unpredictable. An explicit low is both cheaper and more predictable.
 *
 * Reasoning tokens are billed and are spent before the first visible character
 * is emitted, so effort is felt directly as latency and cost:
 *   - "low"    chat. A coaching reply does not improve with a thinking pass.
 *   - "medium" analysis. Four criteria have to stay consistent with each other
 *              and with the descriptor table across up to 20 answers.
 *   - "high"   nothing currently. Retained because the gateway accepts it.
 */
export type ReasoningEffort = "low" | "medium" | "high";

export interface OpenRouterMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * Resolve the chat-completions endpoint.
 *
 * Student transcripts travel over this connection, so plain HTTP is refused
 * outright rather than downgraded with a warning.
 */
/**
 * Resolve the chat-completions endpoint and target model.
 *
 * Automatically detects whether the configured key or URL targets the
 * Teamorouter gateway (api.teamorouter.com), which uses "grok-4.6" directly
 * without the "x-ai/" vendor prefix.
 */
export function resolveFeedbackConfig(): { endpoint: string; model: string } {
  const apiKey = (process.env.OPENROUTER_API_KEY || "").trim();
  let configuredBase = (process.env.OPENROUTER_BASE_URL || "").trim();

  const isTeamo =
    apiKey.startsWith("sk-teamo-") || configuredBase.includes("teamorouter");

  if (!configuredBase && isTeamo) {
    configuredBase = "https://api.teamorouter.com/v1";
  }

  const base = (configuredBase || DEFAULT_API_BASE).replace(/\/+$/, "");

  let parsed: URL;
  try {
    parsed = new URL(base);
  } catch {
    throw new Error("OPENROUTER_BASE_URL is not a valid URL.");
  }
  if (parsed.protocol !== "https:") {
    throw new Error("OPENROUTER_BASE_URL must use HTTPS.");
  }

  const endpoint = base.endsWith("/chat/completions")
    ? base
    : `${base}/chat/completions`;

  let model = (
    process.env.OPENROUTER_MODEL ||
    (isTeamo ? "grok-4.6" : DEFAULT_FEEDBACK_MODEL)
  ).trim();

  if (isTeamo && model.startsWith("x-ai/")) {
    model = model.replace(/^x-ai\//, "");
  }

  return { endpoint, model };
}

export async function callOpenRouter({
  messages,
  systemPrompt = STELLA_SYSTEM_INSTRUCTION,
  maxTokens = 500,
  jsonMode = false,
  reasoningEffort = "low",
}: {
  messages: OpenRouterMessage[];
  systemPrompt?: string;
  maxTokens?: number;
  jsonMode?: boolean;
  reasoningEffort?: ReasoningEffort;
}): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not configured.");
  }

  const { endpoint, model } = resolveFeedbackConfig();

  if (model.endsWith("-contributor")) {
    /*
     * Contributor tiers are explicitly used by the provider to improve their
     * products, and every prompt here contains a student's transcribed speech.
     * Fail loudly at call time rather than leak quietly for months.
     */
    throw new Error(
      "Refusing to send student speech to a '-contributor' model tier, which trains on prompts. Set OPENROUTER_MODEL to a non-training model."
    );
  }

  const body: Record<string, unknown> = {
    model,
    messages: [{ role: "system", content: systemPrompt }, ...messages],
    max_tokens: Math.max(
      1,
      Math.min(MAX_COMPLETION_TOKENS, Math.round(maxTokens))
    ),
  };

  /*
   * Both spellings are sent because gateways disagree: OpenRouter reads
   * `reasoning.effort`, while OpenAI-compatible gateways read
   * `reasoning_effort`. Sending both means switching OPENROUTER_BASE_URL does
   * not silently change how hard the model thinks.
   */
  body.reasoning_effort = reasoningEffort;
  body.reasoning = { effort: reasoningEffort };

  if (jsonMode) {
    body.response_format = { type: "json_object" };
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer":
        process.env.OPENROUTER_SITE_URL || "https://ieltstar.online",
      "X-Title": "IELTStar Speaking Lab",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    console.error("[feedback] request failed", response.status, errorText);
    throw new Error(`Feedback request failed with status ${response.status}.`);
  }

  const data: unknown = await response.json();
  const choice =
    typeof data === "object" &&
    data !== null &&
    "choices" in data &&
    Array.isArray(data.choices)
      ? data.choices[0]
      : undefined;

  const content =
    typeof choice?.message?.content === "string"
      ? choice.message.content.trim()
      : "";

  if (!content) {
    throw new Error("The feedback provider returned no response content.");
  }

  /*
   * For structured JSON evaluations, a truncated completion breaks JSON parsing
   * or schema validation, so fail explicitly. For free-form chat, return whatever
   * content was generated rather than throwing away a complete coaching reply.
   */
  if (jsonMode && choice?.finish_reason === "length") {
    throw new Error(
      "The feedback response was cut off before it was complete (token limit reached)."
    );
  }

  return content;
}
