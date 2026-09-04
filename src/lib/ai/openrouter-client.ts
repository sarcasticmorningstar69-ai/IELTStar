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
 * internal reasoning tokens as completion tokens, so with `reasoning.effort`
 * set to medium a hard mock can burn a large share of the cap before the first
 * character of JSON is emitted. Sizing this to the JSON alone is how you get a
 * truncated object on exactly the submissions that matter most.
 *
 * Keep this comfortably above MAX_ANALYSIS_OUTPUT_TOKENS in scope-guard.ts,
 * and below the model's own max output (Grok 4.6: 65,536).
 */
const MAX_COMPLETION_TOKENS = 32000;

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
function resolveEndpoint(): string {
  const configured = (process.env.OPENROUTER_BASE_URL || "").trim();
  const base = (configured || DEFAULT_API_BASE).replace(/\/+$/, "");

  let parsed: URL;
  try {
    parsed = new URL(base);
  } catch {
    throw new Error("OPENROUTER_BASE_URL is not a valid URL.");
  }
  if (parsed.protocol !== "https:") {
    throw new Error("OPENROUTER_BASE_URL must use HTTPS.");
  }

  // Accept either ".../v1" or a full ".../v1/chat/completions".
  return base.endsWith("/chat/completions") ? base : `${base}/chat/completions`;
}

export async function callOpenRouter({
  messages,
  systemPrompt = STELLA_SYSTEM_INSTRUCTION,
  maxTokens = 500,
  jsonMode = false,
}: {
  messages: OpenRouterMessage[];
  systemPrompt?: string;
  maxTokens?: number;
  jsonMode?: boolean;
}): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not configured.");
  }

  const model = process.env.OPENROUTER_MODEL || DEFAULT_FEEDBACK_MODEL;

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
    reasoning: { effort: "medium" },
  };

  if (jsonMode) {
    body.response_format = { type: "json_object" };
  }

  const response = await fetch(resolveEndpoint(), {
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
    // Do not log the provider body: it may echo student content or account data.
    console.error("[feedback] request failed", response.status);
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
   * A truncated completion is worse than a failed one: the JSON parses as
   * garbage or fails schema validation, and the student sees a generic error.
   * Surface it explicitly so the caller can report an honest failure.
   */
  if (choice?.finish_reason === "length") {
    throw new Error(
      "The feedback response was cut off before it was complete (token limit reached)."
    );
  }

  return content;
}
