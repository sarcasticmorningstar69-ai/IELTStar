/**
 * Stella — assistant identity and media manifest.
 *
 * Stella's animation is produced in code (CSS transforms) rather than video.
 * She is treated as a rigid object: every state is a choreographed sequence of
 * transform/opacity keyframes, which means perfect looping, no file weight,
 * and exact control over timing.
 *
 * WHEN REAL ASSETS ARRIVE:
 * This is the only file that needs to change. Drop the file into /public and
 * point the relevant state at it:
 *
 *   thinking: { kind: "video", src: "/stella/thinking.webm" }
 *   listening: { kind: "image", src: "/stella/listening.png" }
 *
 * `coded`  -> STELLA_ARTWORK still + the CSS animation for that state
 * `image`  -> a custom still for that state + the CSS animation
 * `video`  -> the video plays and the CSS animation is disabled
 */

export type StellaState =
	| "idle"
	| "listening"
	| "transcribing"
	| "thinking"
	| "speaking"
	| "finished"
	| "error";

export type StellaMedia =
	| { kind: "coded" }
	| { kind: "image"; src: string }
	| { kind: "video"; src: string; poster?: string; loop?: boolean };

export const STELLA_NAME = "Stella";

/**
 * Stella's canonical artwork. One asset for both themes on purpose — the star
 * keeps a single consistent identity in light and dark mode.
 *
 * REQUIREMENTS FOR THIS FILE:
 *   - Save it at public/stella-star.png (exactly this name, all lowercase).
 *   - PNG with a TRANSPARENT background, not white. The avatar is full-bleed
 *     with nothing drawn behind it, so a white background shows as a white
 *     block in dark mode.
 *   - Square canvas.
 *
 * If this file is missing, the avatar quietly falls back to
 * STELLA_ARTWORK_FALLBACK rather than rendering a broken image.
 */
export const STELLA_ARTWORK = "/stella-star.png";

/** Shipped asset used when STELLA_ARTWORK cannot be loaded. */
export const STELLA_ARTWORK_FALLBACK = "/ielstar-star.png";

/**
 * How far to zoom into the artwork so the star reaches the edges of the avatar
 * instead of floating in the middle of its own padding.
 *
 * The intended star occupies roughly 72% of its canvas height, so 1.3 removes
 * that empty margin. If you re-export the PNG cropped tight to the star, set
 * this to 1.
 */
export const STELLA_TRIM = 0.86;

/** The shipped fallback is framed more tightly, so it needs less zoom. */
export const STELLA_FALLBACK_TRIM = 0.86;

export const STELLA_MEDIA: Record<StellaState, StellaMedia> = {
	idle: { kind: "coded" },
	listening: { kind: "coded" },
	transcribing: { kind: "coded" },
	thinking: { kind: "coded" },
	speaking: { kind: "coded" },
	finished: { kind: "coded" },
	error: { kind: "coded" },
};

/** Accessible descriptions, also used as fallback tooltips. */
export const STELLA_LABELS: Record<StellaState, string> = {
	idle: "Stella, waiting",
	listening: "Stella is listening",
	transcribing: "Stella is lining up your audio",
	thinking: "Stella is thinking",
	speaking: "Stella is speaking",
	finished: "Stella has finished",
	error: "Stella could not continue",
};

/** Short status lines shown under the large Stella while she works. */
export const STELLA_STATUS_TEXT: Record<StellaState, string> = {
	idle: "Ready when you are.",
	listening: "Listening…",
	transcribing: "Lining up your audio with the transcript…",
	thinking: "Thinking it through…",
	speaking: "Reading it out…",
	finished: "Done.",
	error: "Something stopped me there.",
};
