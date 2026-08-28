/**
 * YouTube mock library helpers — id extraction, numbering and neutral copy.
 *
 * The band labels in VIDEOS are SUPPLIED descriptions of each recording
 * (e.g. "Band 9", "Jumper from 6.5 to 7.5"). They are displayed as provided
 * and never presented as a promise of the student's own result.
 */
import { VIDEOS, type VideoEntry } from "@/lib/data/content";

/** Matches youtu.be/<id>, ?v=<id>, /embed/<id>, /shorts/<id>, /live/<id> forms. */
const YT_ID_RE = /(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/|\/live\/)([A-Za-z0-9_-]{11})/;

/** Extract the 11-character YouTube video id from a supplied url. */
export function extractYouTubeId(url: string): string | null {
  const m = url.match(YT_ID_RE);
  return m ? m[1] : null;
}

/** Standard embed url (no JS API — used for the watch dialog). */
export function embedUrl(ytId: string): string {
  return `https://www.youtube.com/embed/${ytId}?rel=0`;
}

/** Embed url with the JS API enabled (used for the practice-alongside player). */
export function embedUrlWithApi(ytId: string): string {
  return `https://www.youtube.com/embed/${ytId}?enablejsapi=1`;
}

/** Thumbnail for a YouTube video id. */
export function thumbnailUrl(ytId: string): string {
  return `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`;
}

export function videoById(id: string): VideoEntry | undefined {
  return VIDEOS.find((v) => v.id === id);
}

export function videoIndex(id: string): number {
  return VIDEOS.findIndex((v) => v.id === id);
}

/** "Mock 01" … "Mock 30" from the zero-based index. */
export function mockNumber(index: number): string {
  return `Mock ${String(index + 1).padStart(2, "0")}`;
}

/**
 * Short neutral description derived from the SUPPLIED label.
 * Describes the video only — never what the student will score.
 */
export function describeVideo(label: string): string {
  const l = label.trim();
  const band = l.match(/^band\s+([0-9](?:\.[0-9])?)$/i);
  if (band) return `Full speaking mock — labeled Band ${band[1]} by its creator.`;
  const jump = l.match(/from\s+([0-9]+(?:\.[0-9]+)?)\s+to\s+([0-9]+(?:\.[0-9]+)?)/i);
  if (jump) return `Full speaking mock — a candidate described as moving from ${jump[1]} to ${jump[2]}.`;
  return "Full speaking mock from the supplied library.";
}
