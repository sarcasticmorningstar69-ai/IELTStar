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
 * Stella's canonical artwork. One asset for both themes on purpose — the
 * theme-aware circular frame is drawn in CSS, so Stella keeps a single
 * consistent identity in light and dark mode.
 *
 * Swap this to "/stella-star.png" once the cleaned transparent star is ready.
 */
export const STELLA_ARTWORK = "/ielstar-star.png";

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
