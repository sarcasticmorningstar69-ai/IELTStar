"use client";

import * as React from "react";
import { animate, morphTo } from "animejs";
import { CURVES } from "@/lib/animation/anime-engine";
import { cn } from "@/lib/utils";

interface MorphingMockAuraProps {
  isHovered?: boolean;
  className?: string;
  size?: number;
}

// 8-point geometric IELTS star
const PATH_STAR =
  "M 100 0 L 122 72 L 195 72 L 138 116 L 160 188 L 100 144 L 40 188 L 62 116 L 5 72 L 78 72 Z";

// Fluid, rounded blossoming energy shape
const PATH_BLOB =
  "M 100 12 C 145 12 188 55 188 100 C 188 145 145 188 100 188 C 55 188 12 145 12 100 C 12 55 55 12 100 12 Z";

// Luminous 4-point organic diamond star
const PATH_ENERGY =
  "M 100 10 Q 115 85 190 100 Q 115 115 100 190 Q 85 115 10 100 Q 85 85 100 10 Z";

export function MorphingMockAura({ isHovered = false, className, size = 220 }: MorphingMockAuraProps) {
  const svgRef = React.useRef<SVGSVGElement>(null);
  const pathRef = React.useRef<SVGPathElement>(null);
  const targetStarRef = React.useRef<SVGPathElement>(null);
  const targetEnergyRef = React.useRef<SVGPathElement>(null);

  React.useEffect(() => {
    if (!pathRef.current) return;

    if (isHovered && targetEnergyRef.current) {
      try {
        animate(pathRef.current, {
          d: morphTo(targetEnergyRef.current, 0.4),
          duration: 650,
          ease: CURVES.smoothOut,
        });
      } catch {
        /* fallback */
      }
    } else if (!isHovered && targetStarRef.current) {
      try {
        animate(pathRef.current, {
          d: morphTo(targetStarRef.current, 0.4),
          duration: 550,
          ease: CURVES.organicEase,
        });
      } catch {
        /* fallback */
      }
    }
  }, [isHovered]);

  return (
    <svg
      ref={svgRef}
      viewBox="0 0 200 200"
      width={size}
      height={size}
      className={cn("pointer-events-none select-none transition-transform duration-700", className)}
      style={{ width: size, height: size }}
    >
      <defs>
        <path ref={targetStarRef} d={PATH_STAR} fill="none" />
        <path ref={targetEnergyRef} d={PATH_ENERGY} fill="none" />
        <radialGradient id="aura-grad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--brand-bright)" stopOpacity="0.85" />
          <stop offset="50%" stopColor="var(--brand)" stopOpacity="0.45" />
          <stop offset="100%" stopColor="var(--brand)" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Luminous background blur */}
      <circle cx="100" cy="100" r="75" fill="url(#aura-grad)" className="blur-xl opacity-50" />

      {/* Main morphing path */}
      <path
        ref={pathRef}
        d={PATH_STAR}
        fill="currentColor"
        className="text-brand-bright/35 transition-opacity duration-500"
      />
    </svg>
  );
}
