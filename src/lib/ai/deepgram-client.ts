/**
 * Deepgram transcription client for IELTStar.
 *
 * Deepgram is the ONLY source of transcript text in this codebase. The feedback
 * model marks the answer; it never rewrites what the student said.
 */

import type { AiTranscriptWord, AiTimestampEvent } from "./types";

export interface DeepgramTranscriptionResult {
  transcript: string;
  words: AiTranscriptWord[];
  events: AiTimestampEvent[];
}

const DEEPGRAM_ENDPOINT = "https://api.deepgram.com/v1/listen";

/** Pause longer than this between two words is reported as a hesitation. */
const PAUSE_THRESHOLD_SECONDS = 1.0;

export async function transcribeWithDeepgram(
  audioBuffer: Buffer | ArrayBuffer,
  contentType: string = "audio/webm"
): Promise<DeepgramTranscriptionResult> {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    throw new Error("DEEPGRAM_API_KEY is not configured.");
  }

  const model = process.env.DEEPGRAM_MODEL || "nova-3";
  const url = new URL(DEEPGRAM_ENDPOINT);
  url.searchParams.set("model", model);
  url.searchParams.set("smart_format", "true");
  url.searchParams.set("punctuate", "true");
  url.searchParams.set("filler_words", "true");
  url.searchParams.set("words", "true");

  const cleanType = (contentType || "").toLowerCase().trim();
  const safeContentType =
    cleanType.startsWith("audio/")
      ? cleanType
      : cleanType.startsWith("video/")
        ? cleanType.replace(/^video\//, "audio/")
        : "audio/webm";

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      Authorization: `Token ${apiKey}`,
      "Content-Type": safeContentType,
    },
    body: audioBuffer as unknown as BodyInit,
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    console.error("[deepgram] transcription request failed:", response.status, errText);
    throw new Error(`Deepgram transcription failed (${response.status}): ${errText || "unknown error"}`);
  }

  const data = await response.json();
  const alt = data?.results?.channels?.[0]?.alternatives?.[0];
  if (!alt) {
    throw new Error("Deepgram returned no transcript alternative.");
  }

  const rawWords = (alt.words || []) as Array<{
    word: string;
    start: number;
    end: number;
    confidence: number;
    punctuated_word?: string;
  }>;

  const words: AiTranscriptWord[] = rawWords.map((w) => ({
    word: w.punctuated_word || w.word,
    start: w.start,
    end: w.end,
    confidence: w.confidence,
  }));

  // Identify hesitations from gaps between words.
  const events: AiTimestampEvent[] = [];
  for (let i = 1; i < words.length; i++) {
    const prev = words[i - 1];
    const curr = words[i];
    const gap = curr.start - prev.end;
    if (gap > PAUSE_THRESHOLD_SECONDS) {
      events.push({
        start: prev.end,
        end: curr.start,
        criterion: "Fluency & Coherence",
        type: "pause",
        comment: `Mid-utterance pause of ${gap.toFixed(1)}s between "${prev.word}" and "${curr.word}"`,
        reliability: "high",
      });
    }
  }

  return {
    transcript: alt.transcript || "",
    words,
    events,
  };
}
