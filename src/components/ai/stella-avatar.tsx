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
	/** Legacy frame property maintained for backward compatibility. */
	frame?: boolean;
	/** Slow the idle choreography down for small, always-visible placements. */
	quiet?: boolean;
	className?: string;
	label?: string;
};

/**
 * Stella's animated profile avatar.
 *
 * Rendered inside a circular profile container with upright, subtle micro-animations.
 */
export function StellaAvatar({
	state = "idle",
	size = 88,
	level = 0,
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
