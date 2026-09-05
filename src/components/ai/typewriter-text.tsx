"use client";

/**
 * Shared reveal helpers for Stella's replies.
 *
 * Nothing here changes what Stella says. It only changes how the text lands:
 * word by word instead of all at once, because a reply that appears instantly
 * after a long pause reads like a stored answer rather than a live one.
 */
import * as React from "react";
import { cn } from "@/lib/utils";

/** Words revealed per tick, and the gap between ticks. */
export const TYPEWRITER_WORDS_PER_TICK = 2;
export const TYPEWRITER_TICK_MS = 26;

/** What Stella is actually doing while you wait. No fake progress. */
export const REASONING_PHRASES = [
  "Reading your transcript…",
  "Checking it against the band descriptors…",
  "Looking for evidence in your own words…",
  "Weighing fluency against accuracy…",
  "Working out what to say first…",
  "Putting the reply together…",
];

export const REASONING_PHRASE_INTERVAL_MS = 1900;

/** Respects the OS "reduce motion" setting. */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return reduced;
}

/** Rotates through the thinking phrases while `active` is true. */
export function useReasoningPhrase(active: boolean): string {
  const [index, setIndex] = React.useState(0);

  React.useEffect(() => {
    if (!active) {
      setIndex(0);
      return;
    }
    const timer = window.setInterval(() => {
      setIndex((value) => (value + 1) % REASONING_PHRASES.length);
    }, REASONING_PHRASE_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [active]);

  return REASONING_PHRASES[index];
}

/**
 * Reveals `text` word by word.
 *
 * While animating it renders plain text, which is cheap. On the final tick it
 * swaps in `children` — the fully formatted message — so markdown is parsed
 * once rather than on every frame. That keeps long replies from stuttering on
 * a mid-range phone.
 */
export function TypewriterText({
  text,
  animate = true,
  children,
  onTick,
  onDone,
  className,
}: {
  text: string;
  animate?: boolean;
  /** The finished, formatted version of the same text. */
  children: React.ReactNode;
  onTick?: () => void;
  onDone?: () => void;
  className?: string;
}) {
  const reducedMotion = usePrefersReducedMotion();
  const shouldAnimate = animate && !reducedMotion && text.length > 0;

  // Keep whitespace as its own token so line breaks survive the reveal.
  const tokens = React.useMemo(() => text.split(/(\s+)/).filter(Boolean), [text]);

  const [shown, setShown] = React.useState(() => (shouldAnimate ? 0 : tokens.length));
  const onTickRef = React.useRef(onTick);
  const onDoneRef = React.useRef(onDone);

  React.useEffect(() => {
    onTickRef.current = onTick;
    onDoneRef.current = onDone;
  });

  React.useEffect(() => {
    if (!shouldAnimate) {
      setShown(tokens.length);
      onDoneRef.current?.();
      return;
    }

    setShown(0);
    let cancelled = false;
    let count = 0;

    const timer = window.setInterval(() => {
      if (cancelled) return;
      // Two words means four tokens, because separators count too.
      count = Math.min(tokens.length, count + TYPEWRITER_WORDS_PER_TICK * 2);
      setShown(count);
      onTickRef.current?.();
      if (count >= tokens.length) {
        window.clearInterval(timer);
        onDoneRef.current?.();
      }
    }, TYPEWRITER_TICK_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [tokens, shouldAnimate]);

  const finished = shown >= tokens.length;

  if (finished) return <>{children}</>;

  return (
    <span className={cn("whitespace-pre-wrap", className)}>
      {tokens.slice(0, shown).join("")}
      <span
        aria-hidden
        className="ml-0.5 inline-block h-3.5 w-[2px] translate-y-0.5 animate-pulse rounded-full bg-current align-baseline opacity-70"
      />
    </span>
  );
}
