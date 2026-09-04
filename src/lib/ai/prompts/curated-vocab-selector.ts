/**
 * Curated vocabulary selector from IELTStar program banks.
 *
 * Pulls topic-matched B2/C1/C2 phrases and collocations from the program
 * datasets (Part 1, Part 2, and Part 3 vocabulary) to ground Stella's
 * Deep Dive lexical recommendations directly in the IELTStar curriculum.
 */

import part1Vocab from "@/lib/data/generated/part1-vocab.json";
import part2Vocab from "@/lib/data/generated/part2-vocab.json";
import part3Vocab from "@/lib/data/generated/part3-vocab.json";

export interface ProgramVocabItem {
  phrase: string;
  level: "B2" | "C1" | "C2";
  definition: string;
}

const allProgramVocab: ProgramVocabItem[] = [];

// Index all program vocabulary once
function initVocabPool() {
  if (allProgramVocab.length > 0) return;

  const collect = (bank: Record<string, unknown[]>) => {
    for (const items of Object.values(bank)) {
      if (Array.isArray(items)) {
        for (const item of items) {
          if (
            typeof item === "object" &&
            item !== null &&
            "phrase" in item &&
            "level" in item &&
            "definition" in item
          ) {
            allProgramVocab.push({
              phrase: String(item.phrase),
              level: item.level as "B2" | "C1" | "C2",
              definition: String(item.definition),
            });
          }
        }
      }
    }
  };

  collect(part1Vocab as Record<string, unknown[]>);
  collect(part2Vocab as Record<string, unknown[]>);
  collect(part3Vocab as Record<string, unknown[]>);
}

/**
 * Find the most relevant vocabulary from the IELTStar program for a given prompt/transcript.
 */
export function getCuratedVocabForTopic(
  contextText: string,
  limit = 12
): ProgramVocabItem[] {
  initVocabPool();

  const words = contextText
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3);

  const scored: Array<{ item: ProgramVocabItem; score: number }> = [];

  for (const item of allProgramVocab) {
    const pText = `${item.phrase} ${item.definition}`.toLowerCase();
    let matchCount = 0;
    for (const word of words) {
      if (pText.includes(word)) {
        matchCount += 1;
      }
    }
    // Slight priority for C1/C2 items
    const levelWeight = item.level === "C2" ? 2.5 : item.level === "C1" ? 2.0 : 1.0;
    const score = matchCount * levelWeight;
    if (score > 0) {
      scored.push({ item, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);

  const chosen: ProgramVocabItem[] = [];
  const seenPhrases = new Set<string>();

  for (const entry of scored) {
    if (!seenPhrases.has(entry.item.phrase.toLowerCase())) {
      seenPhrases.add(entry.item.phrase.toLowerCase());
      chosen.push(entry.item);
      if (chosen.length >= limit) break;
    }
  }

  // If few specific keyword matches, backfill with high-frequency C1/C2 collocations
  if (chosen.length < limit) {
    for (const item of allProgramVocab) {
      if (item.level === "C1" || item.level === "C2") {
        if (!seenPhrases.has(item.phrase.toLowerCase())) {
          seenPhrases.add(item.phrase.toLowerCase());
          chosen.push(item);
          if (chosen.length >= limit) break;
        }
      }
    }
  }

  return chosen;
}
