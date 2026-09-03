/**
 * Central Anime.js v4 Animation & Curve Speed Engine
 * Provides physics-based curve speeds, window transitions, and path morphing.
 */
import { animate, cubicBezier, spring, morphTo } from "animejs";

/**
 * Curated curve speeds (cubic-bezier & springs) for silky, organic movement
 */
export const CURVES = {
  /** Fluid, Apple-grade exponential deceleration */
  smoothOut: cubicBezier(0.16, 1, 0.3, 1),
  /** Gentle, natural deceleration for UI cards and chips */
  organicEase: cubicBezier(0.25, 1, 0.5, 1),
  /** Quick, responsive easing for micro-interactions */
  snappy: cubicBezier(0.2, 0.8, 0.2, 1),
  /** Organic physics spring with zero jitter */
  spring: spring({ mass: 1, stiffness: 130, damping: 15 }),
  /** Soft bouncing spring */
  elasticSpring: spring({ mass: 1.2, stiffness: 100, damping: 12 }),
};

/**
 * Animates a window or page entrance with a smooth curve speed and slight scale/translate.
 */
export function animateWindowEntrance(target: HTMLElement | null, onComplete?: () => void) {
  if (!target) return;

  const params: Record<string, any> = {
    opacity: [0, 1],
    translateY: [12, 0],
    scale: [0.992, 1],
    duration: 380,
    ease: CURVES.smoothOut,
  };
  if (onComplete) {
    params.onComplete = onComplete;
  }

  animate(target, params);

  // Stagger direct section children if present
  const children = target.querySelectorAll<HTMLElement>(".stagger-in");
  if (children.length > 0) {
    animate(Array.from(children), {
      opacity: [0, 1],
      translateY: [10, 0],
      delay: (_el, i) => 40 + (i ?? 0) * 35,
      duration: 320,
      ease: CURVES.organicEase,
    });
  }
}

/**
 * Animates an expanding modal or full-window workspace
 */
export function animateModalExpansion(target: HTMLElement | null, onComplete?: () => void) {
  if (!target) return;

  const params: Record<string, any> = {
    opacity: [0, 1],
    scale: [0.965, 1],
    duration: 340,
    ease: CURVES.smoothOut,
  };
  if (onComplete) {
    params.onComplete = onComplete;
  }

  animate(target, params);
}

/**
 * Morphs an SVG path to a target path using Anime.js v4 morphing
 */
export function morphSvgPath(
  pathElement: SVGPathElement | null,
  targetPathElement: SVGPathElement | null,
  duration: number = 600,
  ease = CURVES.smoothOut
) {
  if (!pathElement || !targetPathElement) return;

  try {
    animate(pathElement, {
      d: morphTo(targetPathElement, 0.33),
      duration,
      ease,
    });
  } catch (err) {
    console.warn("Path morph error:", err);
  }
}
