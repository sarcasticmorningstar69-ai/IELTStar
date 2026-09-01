"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import {
	STELLA_ARTWORK,
	STELLA_ARTWORK_FALLBACK,
	STELLA_FALLBACK_TRIM,
	STELLA_LABELS,
	STELLA_MEDIA,
	STELLA_TRIM,
	type StellaState,
} from "@/lib/ai/stella-media";
import "./stella.css";

/**
 * Remembered across every avatar on the page: once we know the preferred
 * artwork 404s there is no point letting each instance fail separately.
 */
const missingArtwork = new Set<string>();

type StellaAvatarProps = {
	/** Which of Stella's states to play. */
	state?: StellaState;
	/** Rendered size in pixels. 34-56 for buttons, 80-96 for panels, 130-240 for the workspace. */
	size?: number;
	/** Live microphone level, 0-1. Only affects the listening state. */
	level?: number;
	/**
	 * Draw the circular "observatory window" behind Stella.
	 *
	 * Off by default: the avatar is the artwork itself, edge to edge, with no
	 * surrounding chrome. Turn it on only when Stella sits on a busy or
	 * coloured surface and needs separating from it.
	 */
	frame?: boolean;
	/** Slow the idle choreography down for small, always-visible placements. */
	quiet?: boolean;
	className?: string;
	label?: string;
};

/**
 * Stella's animated avatar.
 *
 * Motion is produced entirely in CSS from her still artwork, so there are no
 * video files to load and the loop is always seamless. Any state can be
 * upgraded to a supplied image or video later by editing STELLA_MEDIA in
 * src/lib/ai/stella-media.ts — no changes are needed here.
 */
export function StellaAvatar({
	state = "idle",
	size = 88,
	level = 0,
	frame = false,
	quiet = false,
	className,
	label,
}: StellaAvatarProps) {
	const media = STELLA_MEDIA[state] ?? { kind: "coded" as const };
	const clampedLevel = Math.min(1, Math.max(0, Number.isFinite(level) ? level : 0));
	const showOrbit = state === "transcribing" || state === "thinking";
	const showRing = state === "listening";

	const preferred = media.kind === "image" ? media.src : STELLA_ARTWORK;

	// Re-render once if the preferred artwork turns out to be missing.
	const [, forceRender] = React.useReducer((n: number) => n + 1, 0);
	const usingFallback =
		missingArtwork.has(preferred) && preferred !== STELLA_ARTWORK_FALLBACK;
	const src = usingFallback ? STELLA_ARTWORK_FALLBACK : preferred;

	const handleError = React.useCallback(() => {
		if (missingArtwork.has(preferred)) return;
		missingArtwork.add(preferred);
		if (process.env.NODE_ENV !== "production") {
			console.warn(
				`[Stella] Could not load "${preferred}". Falling back to "${STELLA_ARTWORK_FALLBACK}". ` +
					`Save the artwork at public${preferred} to use it.`
			);
		}
		forceRender();
	}, [preferred]);

	return (
		<span
			role="img"
			aria-label={label ?? STELLA_LABELS[state]}
			className={cn(
				"stella",
				`stella-state-${state}`,
				!frame && "stella-frameless",
				quiet && "stella-quiet",
				className
			)}
			style={
				{
					"--stella-size": `${size}px`,
					"--stella-level": clampedLevel,
					"--stella-trim": usingFallback ? STELLA_FALLBACK_TRIM : STELLA_TRIM,
				} as React.CSSProperties
			}
		>
			{frame && <span className="stella-frame" aria-hidden="true" />}
			{showRing && <span className="stella-ring" aria-hidden="true" />}
			{showOrbit && <span className="stella-orbit" aria-hidden="true" />}
			<span className="stella-stage" aria-hidden="true">
				{media.kind === "video" ? (
					<video
						key={`${state}-${media.src}`}
						className="stella-body stella-media"
						src={media.src}
						poster={media.poster}
						autoPlay
						muted
						playsInline
						loop={media.loop ?? state !== "finished"}
					/>
				) : (
					/* eslint-disable-next-line @next/next/no-img-element */
					<img
						key={`${state}-${src}`}
						className="stella-body"
						src={src}
						alt=""
						draggable={false}
						onError={handleError}
					/>
				)}
			</span>
		</span>
	);
}
