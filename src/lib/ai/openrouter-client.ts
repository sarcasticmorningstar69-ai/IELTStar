/** OpenRouter client for Stella. The selected model is configured server-side. */

import { STELLA_SYSTEM_INSTRUCTION } from "./prompts/stella-prompt";

/**
 * Default feedback model.
 *
 * Deliberately NOT a "-contributor" tier. Those tiers are cheaper because the
 * provider uses the prompts to improve its products, and our prompts contain
 * students' transcribed speech. Never make a contributor tier the default.
 *
 * Gemini 3.8 Flash is generally available (not preview), supports structured
 * JSON output, and allows large completions — which matters because a full
 * mock returns per-answer notes for up to 20 recordings in one object.
 */
export const DEFAULT_FEEDBACK_MODEL = "google/gemini-3.8-flash";

/**
 * Hard ceiling on completion length.
 *
 * This is a safety limit, not a budget: providers bill only for tokens actually
 * generated, so a high ceiling costs nothing on short answers. It exists to
 * stop a runaway response, and it must stay comfortably above the largest
 * legitimate analysis or the JSON arrives truncated and fails validation.
 */
const MAX_COMPLETION_TOKENS = 16000;

export interface OpenRouterMessage {
  role: "system" | "user" | "assistant";
  content: string;
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

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
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
    console.error("[OpenRouter] request failed", response.status);
    throw new Error(`OpenRouter request failed with status ${response.status}.`);
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
    throw new Error("OpenRouter returned no response content.");
  }

  /*
   * A truncated completion is worse than a failed one: the JSON parses as
   * garbage or fails schema validation, and the student sees a generic error.
   * Surface it explicitly so the caller can report an honest failure.
   */
  if (choice?.finish_reason === "length") {
    throw new Error(
      "OpenRouter response was cut off before it was complete (token limit reached)."
    );
  }

  return content;
}
