/**
 * OpenRouter Client for IELTStar
 * Powered by Meta Muse Spark 1.3 Contributor
 */

import { STELLA_SYSTEM_INSTRUCTION } from "./prompts/stella-prompt";

const CODING_KEYWORDS = [
  "write code",
  "write a python",
  "write a script",
  "javascript code",
  "create a function",
  "def ",
  "class ",
  "import os",
  "SELECT * FROM",
  "npm install",
  "git push",
  "write an api",
  "fix my code",
  "debug this code",
  "write a react",
  "html code",
  "css code",
];

export function isOffTopicCodingRequest(text: string): boolean {
  const lower = text.toLowerCase();
  return CODING_KEYWORDS.some((kw) => lower.includes(kw));
}

export const CODING_REFUSAL_RESPONSE =
  "I am Stella, your Senior IELTS Speaking Examiner and preparation coach. My expertise is dedicated strictly to evaluating your spoken English, fluency drills, lexical collocations, and official band scoring. I do not assist with programming, software engineering, or technical coding tasks. Let's focus on elevating your IELTS Speaking score!";

export interface OpenRouterMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export async function callOpenRouter({
  messages,
  systemPrompt = STELLA_SYSTEM_INSTRUCTION,
  maxTokens = 2000,
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

  const model = process.env.OPENROUTER_MODEL || "meta/muse-spark-1.3-contributor";

  // Check last user message for coding attempts
  const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
  if (lastUserMsg && isOffTopicCodingRequest(lastUserMsg.content)) {
    return CODING_REFUSAL_RESPONSE;
  }

  const payloadMessages = [
    { role: "system", content: systemPrompt },
    ...messages,
  ];

  const body: Record<string, unknown> = {
    model,
    messages: payloadMessages,
    max_tokens: maxTokens,
    reasoning: { effort: "medium" },
  };

  if (jsonMode) {
    body.response_format = { type: "json_object" };
  }

  let response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://ieltstar.app",
      "X-Title": "IELTStar Speaking Lab",
    },
    body: JSON.stringify(body),
  });

  // If Meta Muse Spark requires 18+ attestation at https://openrouter.ai/settings/preferences,
  // gracefully fall back to GLM 5.3 Flash so user never sees downtime
  if (!response.ok && response.status === 403) {
    const errorData = await response.json().catch(() => ({}));
    if (errorData?.error?.message?.includes("18+ age confirmation")) {
      console.warn(
        "[OpenRouter] 18+ age confirmation required at https://openrouter.ai/settings/preferences for",
        model,
        "— seamlessly falling back to z-ai/glm-5.3-flash"
      );
      body.model = "z-ai/glm-5.3-flash";
      response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://ieltstar.app",
          "X-Title": "IELTStar Speaking Lab",
        },
        body: JSON.stringify(body),
      });
    }
  }

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[OpenRouter Error]", response.status, errorText);
    throw new Error(`OpenRouter request failed (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const choice = data?.choices?.[0]?.message;
  // If model put output in reasoning and content is empty (or content is in content)
  const content = choice?.content || (choice?.reasoning ? `Stella: ${choice.reasoning}` : null);
  if (!content) {
    throw new Error("No response content from OpenRouter.");
  }

  return content;
}
