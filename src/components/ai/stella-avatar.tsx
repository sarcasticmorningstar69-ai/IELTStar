"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import {
	STELLA_ARTWORK,
	STELLA_LABELS,
	STELLA_MEDIA,
	type StellaState,
} from "@/lib/ai/stella-media";
import "./stella.css";

type StellaAvatarProps = {
	/** Which of Stella's states to play. */
	state?: StellaState;
	/** Rendered size in pixels. 34-56 for buttons, 80-96 for panels, 130-240 for the workspace. */
	size?: number;
	/** Live microphone level, 0-1. Only affects the listening state. */
	level?: number;
	/** Draw the theme-aware circular frame. Turn off when placing Stella on a coloured surface. */
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
	frame = true,
	quiet = false,
	className,
	label,
}: StellaAvatarProps) {
	const media = STELLA_MEDIA[state] ?? { kind: "coded" as const };
	const clampedLevel = Math.min(1, Math.max(0, Number.isFinite(level) ? level : 0));
	const showOrbit = state === "transcribing" || state === "thinking";
	const showRing = state === "listening";

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
						key={state}
						className="stella-body"
						src={media.kind === "image" ? media.src : STELLA_ARTWORK}
						alt=""
						draggable={false}
					/>
				)}
			</span>
		</span>
	);
}
