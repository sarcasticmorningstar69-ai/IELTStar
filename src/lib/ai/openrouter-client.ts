/** OpenRouter client for Stella. The selected model is configured server-side. */

import { STELLA_SYSTEM_INSTRUCTION } from "./prompts/stella-prompt";

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

  const model =
    process.env.OPENROUTER_MODEL || "meta/muse-spark-1.3-contributor";
  const body: Record<string, unknown> = {
    model,
    messages: [{ role: "system", content: systemPrompt }, ...messages],
    max_tokens: Math.max(1, Math.min(3000, Math.round(maxTokens))),
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
  const content =
    typeof data === "object" &&
    data !== null &&
    "choices" in data &&
    Array.isArray(data.choices) &&
    typeof data.choices[0]?.message?.content === "string"
      ? data.choices[0].message.content.trim()
      : "";

  if (!content) {
    throw new Error("OpenRouter returned no response content.");
  }

  return content;
}
