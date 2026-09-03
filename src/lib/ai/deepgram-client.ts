/**
 * Deepgram Transcription Client for IELTStar
 * Powered by Deepgram Nova-3 with word-level timestamps & filler words
 */

import type { AiTranscriptWord, AiTimestampEvent } from "./types";

export interface DeepgramTranscriptionResult {
  transcript: string;
  words: AiTranscriptWord[];
  events: AiTimestampEvent[];
}

export async function transcribeWithDeepgram(
  audioBuffer: Buffer | ArrayBuffer,
  contentType: string = "audio/webm"
): Promise<DeepgramTranscriptionResult> {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    throw new Error("DEEPGRAM_API_KEY is not configured.");
  }

  const model = process.env.DEEPGRAM_MODEL || "nova-3";
  const url = `https://api.deepgram.com/v1/listen?model=${model}&smart_format=true&punctuate=true&filler_words=true&words=true`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Token ${apiKey}`,
      "Content-Type": contentType,
    },
    body: new Blob([audioBuffer as unknown as BlobPart], { type: contentType }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[Deepgram Error]", response.status, errorText);
    throw new Error(`Deepgram transcription failed (${response.status}): ${errorText}`);
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

  // Identify hesitations / pauses from word gaps (> 1.0s gap)
  const events: AiTimestampEvent[] = [];
  for (let i = 1; i < words.length; i++) {
    const prev = words[i - 1];
    const curr = words[i];
    const gap = curr.start - prev.end;
    if (gap > 1.0) {
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
