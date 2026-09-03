"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Minus, Plus, Sparkles } from "lucide-react";

export const BAND_VALUES = [5.5, 6.0, 6.5, 7.0, 7.5, 8.0, 8.5, 9.0];

interface BandWheelPickerProps {
  value: number;
  onChange: (score: number) => void;
  className?: string;
}

export function BandWheelPicker({ value, onChange, className }: BandWheelPickerProps) {
  const wheelRef = React.useRef<HTMLDivElement>(null);
  const isDragging = React.useRef(false);
  const lastAngle = React.useRef(0);
  const totalRotation = React.useRef(0);

  const currentIndex = Math.max(
    0,
    BAND_VALUES.findIndex((b) => Math.abs(b - value) < 0.1)
  );

  const stepAngle = 360 / BAND_VALUES.length; // 45 degrees per band

  // Pointer indicator is at top (0 degrees / 12 o'clock).
  // When item i is at top, rotation = -i * stepAngle.
  const targetRotation = -currentIndex * stepAngle;

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!wheelRef.current) return;
    const rect = wheelRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    isDragging.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    lastAngle.current = Math.atan2(e.clientY - cy, e.clientX - cx) * (180 / Math.PI);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging.current || !wheelRef.current) return;
    const rect = wheelRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const currentAngle = Math.atan2(e.clientY - cy, e.clientX - cx) * (180 / Math.PI);
    let delta = currentAngle - lastAngle.current;

    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;

    lastAngle.current = currentAngle;
    totalRotation.current += delta;

    const rawIndex = Math.round(-totalRotation.current / stepAngle);
    const wrapped = ((rawIndex % BAND_VALUES.length) + BAND_VALUES.length) % BAND_VALUES.length;
    if (wrapped !== currentIndex) {
      onChange(BAND_VALUES[wrapped]);
    }
  };

  const handlePointerUp = () => {
    isDragging.current = false;
    totalRotation.current = targetRotation;
  };

  React.useEffect(() => {
    totalRotation.current = targetRotation;
  }, [targetRotation]);

  const nudge = (step: number) => {
    const nextIdx = Math.max(0, Math.min(BAND_VALUES.length - 1, currentIndex + step));
    onChange(BAND_VALUES[nextIdx]);
  };

  return (
    <div className={cn("relative flex flex-col items-center select-none py-2", className)}>
      {/* Rotary Dial Container */}
      <div className="relative flex items-center justify-center p-3">
        {/* Top Indicator Arrow */}
        <div className="pointer-events-none absolute -top-1 left-1/2 z-20 -translate-x-1/2 flex flex-col items-center">
          <div className="h-0 w-0 border-x-[8px] border-x-transparent border-t-[10px] border-t-brand-bright drop-shadow-md" />
        </div>

        {/* Outer Ring Ambient Glow */}
        <div className="absolute inset-1 rounded-full border border-brand-bright/25 bg-gradient-to-b from-brand-bright/10 via-transparent to-brand-bright/5 shadow-inner" />

        {/* The Rotating Wheel */}
        <div
          ref={wheelRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className="relative h-60 w-60 cursor-grab active:cursor-grabbing rounded-full border-2 border-border/90 bg-surface shadow-2xl transition-transform duration-300 ease-out"
          style={{
            transform: `rotate(${totalRotation.current}deg)`,
            touchAction: "none",
          }}
        >
          {/* Tick marks & numbers along perimeter */}
          {BAND_VALUES.map((band, i) => {
            const angle = i * stepAngle;
            const isSelected = i === currentIndex;
            const rad = (angle - 90) * (Math.PI / 180);
            const r = 90;
            const x = 120 + r * Math.cos(rad);
            const y = 120 + r * Math.sin(rad);

            return (
              <div
                key={band}
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(band);
                }}
                className={cn(
                  "absolute flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-xs font-bold transition-all cursor-pointer",
                  isSelected
                    ? "bg-brand-bright text-primary-foreground shadow-lg scale-125 ring-2 ring-brand-bright/50"
                    : "text-muted-foreground hover:text-foreground hover:scale-110"
                )}
                style={{
                  left: `${x}px`,
                  top: `${y}px`,
                  transform: `translate(-50%, -50%) rotate(${-totalRotation.current}deg)`,
                }}
              >
                {band.toFixed(1)}
              </div>
            );
          })}

          {/* Decorative dial tracks */}
          <div className="absolute inset-11 rounded-full border border-border/50" />
          <div className="absolute inset-12 rounded-full border border-dashed border-border/30" />
        </div>

        {/* Center Display Hub */}
        <div className="pointer-events-none absolute z-10 flex h-24 w-24 flex-col items-center justify-center rounded-full border border-brand-bright/30 bg-card/95 shadow-xl backdrop-blur-md">
          <span className="text-[10px] font-bold tracking-wider text-brand-bright uppercase">
            Target
          </span>
          <span className="text-3xl font-black tracking-tight text-foreground">
            {value.toFixed(1)}
          </span>
          <span className="text-[9px] font-medium text-muted-foreground">
            Band Score
          </span>
        </div>
      </div>

      {/* Stepper Controls */}
      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          onClick={() => nudge(-1)}
          disabled={currentIndex <= 0}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-surface text-muted-foreground transition-all hover:border-brand-bright/40 hover:text-foreground disabled:opacity-30"
          aria-label="Decrease score"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>

        <span className="text-[11px] font-medium text-muted-foreground">
          Rotate dial or tap to pick
        </span>

        <button
          type="button"
          onClick={() => nudge(1)}
          disabled={currentIndex >= BAND_VALUES.length - 1}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-surface text-muted-foreground transition-all hover:border-brand-bright/40 hover:text-foreground disabled:opacity-30"
          aria-label="Increase score"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
