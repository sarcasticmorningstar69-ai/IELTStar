"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Minus, Plus } from "lucide-react";

export const BAND_VALUES = [5.5, 6.0, 6.5, 7.0, 7.5, 8.0, 8.5, 9.0];

interface BandWheelPickerProps {
  value: number;
  onChange: (score: number) => void;
  className?: string;
}

/**
 * Calculates the shortest angular distance to targetAngle relative to currentAngle,
 * preventing long 360-degree reverse spins when crossing the 9.0 <-> 5.5 boundary.
 */
function getClosestAngle(currentAngle: number, targetAngle: number): number {
  const diff = ((((targetAngle - currentAngle) % 360) + 540) % 360) - 180;
  return currentAngle + diff;
}

export function BandWheelPicker({ value, onChange, className }: BandWheelPickerProps) {
  const wheelRef = React.useRef<HTMLDivElement>(null);
  const valueRef = React.useRef(value);
  valueRef.current = value;

  const stepAngle = 360 / BAND_VALUES.length; // 45 degrees per band

  const currentIndex = Math.max(
    0,
    BAND_VALUES.findIndex((b) => Math.abs(b - value) < 0.1)
  );

  // Initial target angle for current value:
  // Pointer indicator is at 12 o'clock (0°).
  // Band i is initially placed at i * stepAngle (relative to 12 o'clock).
  // Rotating the wheel by -i * stepAngle brings Band i to 12 o'clock.
  const initialRotation = -currentIndex * stepAngle;

  const [rotation, setRotation] = React.useState(initialRotation);
  const rotationRef = React.useRef(initialRotation);
  const [isDragging, setIsDragging] = React.useState(false);

  // Drag tracking state
  const dragState = React.useRef<{
    cx: number;
    cy: number;
    lastAngle: number;
    startX: number;
    startY: number;
    hasMoved: boolean;
  }>({
    cx: 0,
    cy: 0,
    lastAngle: 0,
    startX: 0,
    startY: 0,
    hasMoved: false,
  });

  // Keep rotation in sync with value when NOT actively dragging
  React.useEffect(() => {
    if (!isDragging) {
      const targetAngle = -currentIndex * stepAngle;
      const targetRot = getClosestAngle(rotationRef.current, targetAngle);
      rotationRef.current = targetRot;
      setRotation(targetRot);
    }
  }, [currentIndex, stepAngle, isDragging]);

  const handlePointerDown = (e: React.PointerEvent) => {
    // Only drag with primary pointer (left click / touch)
    if (e.button !== 0) return;
    if (!wheelRef.current) return;

    const rect = wheelRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const angle = Math.atan2(e.clientY - cy, e.clientX - cx) * (180 / Math.PI);

    dragState.current = {
      cx,
      cy,
      lastAngle: angle,
      startX: e.clientX,
      startY: e.clientY,
      hasMoved: false,
    };

    setIsDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging || !wheelRef.current) return;

    const { cx, cy, lastAngle, startX, startY } = dragState.current;
    const currentAngle = Math.atan2(e.clientY - cy, e.clientX - cx) * (180 / Math.PI);

    let delta = currentAngle - lastAngle;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;

    dragState.current.lastAngle = currentAngle;

    if (!dragState.current.hasMoved) {
      const dist = Math.hypot(e.clientX - startX, e.clientY - startY);
      if (dist > 4) {
        dragState.current.hasMoved = true;
      }
    }

    const nextRotation = rotationRef.current + delta;
    rotationRef.current = nextRotation;
    setRotation(nextRotation);

    // Determine nearest band to 12 o'clock pointer:
    const normalized = ((-nextRotation % 360) + 360) % 360;
    const nearestIdx = Math.round(normalized / stepAngle) % BAND_VALUES.length;
    const nearestBand = BAND_VALUES[nearestIdx];

    if (nearestBand !== valueRef.current) {
      valueRef.current = nearestBand;
      onChange(nearestBand);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDragging) return;
    setIsDragging(false);

    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }

    // Snap smoothly to nearest band on release
    const normalized = ((-rotationRef.current % 360) + 360) % 360;
    const nearestIdx = Math.round(normalized / stepAngle) % BAND_VALUES.length;
    const targetAngle = -nearestIdx * stepAngle;
    const snapped = getClosestAngle(rotationRef.current, targetAngle);
    rotationRef.current = snapped;
    setRotation(snapped);
  };

  const handleNumberClick = (band: number, index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    // If the user was dragging, don't treat pointer release as a click
    if (dragState.current.hasMoved) return;

    onChange(band);
    const targetAngle = -index * stepAngle;
    const nextRot = getClosestAngle(rotationRef.current, targetAngle);
    rotationRef.current = nextRot;
    setRotation(nextRot);
  };

  const nudge = (step: number) => {
    const nextIdx = Math.max(0, Math.min(BAND_VALUES.length - 1, currentIndex + step));
    const nextBand = BAND_VALUES[nextIdx];
    onChange(nextBand);
    const targetAngle = -nextIdx * stepAngle;
    const nextRot = getClosestAngle(rotationRef.current, targetAngle);
    rotationRef.current = nextRot;
    setRotation(nextRot);
  };

  return (
    <div className={cn("relative flex flex-col items-center select-none py-2", className)}>
      {/* Rotary Dial Outer Frame - Explicit size so all elements are 100% concentric via inset-0 m-auto */}
      <div className="relative w-[276px] h-[276px]">
        {/* Top Indicator Arrow - Precisely pointing down into the 12 o'clock active score */}
        <div className="pointer-events-none absolute top-1.5 left-1/2 z-30 -translate-x-1/2 flex flex-col items-center">
          <div className="h-0 w-0 border-x-[7px] border-x-transparent border-t-[10px] border-t-brand drop-shadow-md" />
        </div>

        {/* Outer Ring Ambient Glow - Perfectly concentric */}
        <div className="pointer-events-none absolute inset-0 m-auto w-[266px] h-[266px] rounded-full border border-brand/20 bg-gradient-to-b from-brand/10 via-transparent to-brand/5 shadow-inner" />

        {/* The Rotating Wheel - Perfectly centered with inset-0 m-auto */}
        <div
          ref={wheelRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          tabIndex={0}
          role="slider"
          aria-label="Target IELTS Band Score"
          aria-valuenow={value}
          aria-valuemin={5.5}
          aria-valuemax={9.0}
          aria-valuetext={`Band ${value.toFixed(1)}`}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight" || e.key === "ArrowUp") {
              e.preventDefault();
              nudge(1);
            } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
              e.preventDefault();
              nudge(-1);
            }
          }}
          className={cn(
            "absolute inset-0 m-auto w-[240px] h-[240px] cursor-grab active:cursor-grabbing rounded-full border-2 border-border/90 bg-surface shadow-2xl outline-none focus-visible:ring-2 focus-visible:ring-brand/50",
            isDragging
              ? "transition-none"
              : "transition-transform duration-300 cubic-bezier(0.2, 0.8, 0.2, 1)"
          )}
          style={{
            transform: `rotate(${rotation}deg)`,
            transformOrigin: "center center",
            touchAction: "none",
          }}
        >
          {/* Tick marks & numbers along perimeter */}
          {BAND_VALUES.map((band, i) => {
            const angle = i * stepAngle;
            const isSelected = i === currentIndex;
            // 0 degrees corresponds to 12 o'clock (-90° in standard trig coords)
            const rad = (angle - 90) * (Math.PI / 180);
            const r = 90;
            const x = 120 + r * Math.cos(rad);
            const y = 120 + r * Math.sin(rad);

            return (
              <button
                key={band}
                type="button"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  handlePointerDown(e);
                }}
                onClick={(e) => handleNumberClick(band, i, e)}
                className={cn(
                  "absolute flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold transition-colors cursor-pointer select-none",
                  isDragging
                    ? "transition-none"
                    : "transition-transform duration-300 cubic-bezier(0.2, 0.8, 0.2, 1)",
                  isSelected
                    ? "bg-brand text-white shadow-lg ring-2 ring-brand/40 scale-110 z-10 font-black"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/40 hover:scale-105"
                )}
                style={{
                  left: `${x}px`,
                  top: `${y}px`,
                  transform: `translate(-50%, -50%) rotate(${-rotation}deg)`,
                  transformOrigin: "center center",
                }}
                aria-label={`Select band ${band.toFixed(1)}`}
              >
                {band.toFixed(1)}
              </button>
            );
          })}

          {/* Concentric decorative tracks inside the wheel */}
          <div className="pointer-events-none absolute inset-0 m-auto w-[150px] h-[150px] rounded-full border border-border/50" />
          <div className="pointer-events-none absolute inset-0 m-auto w-[138px] h-[138px] rounded-full border border-dashed border-border/40" />
        </div>

        {/* Center Display Hub - Guaranteed 100% mathematically and visually centered */}
        <div className="pointer-events-none absolute inset-0 m-auto z-20 flex h-[98px] w-[98px] flex-col items-center justify-center rounded-full border border-brand/30 bg-card/95 shadow-xl backdrop-blur-md">
          <span className="text-[10px] font-bold tracking-wider text-brand uppercase">
            Target
          </span>
          <span className="text-3xl font-black tracking-tight text-foreground leading-none my-0.5">
            {value.toFixed(1)}
          </span>
          <span className="text-[9px] font-medium text-muted-foreground">
            Band Score
          </span>
        </div>
      </div>

      {/* Stepper Controls */}
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={() => nudge(-1)}
          disabled={currentIndex <= 0}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-surface text-muted-foreground transition-all hover:border-brand/40 hover:text-foreground disabled:opacity-30 disabled:pointer-events-none"
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
          className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-surface text-muted-foreground transition-all hover:border-brand/40 hover:text-foreground disabled:opacity-30 disabled:pointer-events-none"
          aria-label="Increase score"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
