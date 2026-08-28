"use client";

import * as React from "react";
import Image from "next/image";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

/** The authentic IELTStar star mark (uploaded PNG, theme-aware variants). */
export function StarMark({ className, size = 28 }: { className?: string; size?: number }) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  const dark = mounted ? resolvedTheme === "dark" : true; // dark is default
  const src = dark ? "/ielstar-star-dark.png" : "/ielstar-star-light.png";
  return (
    <Image
      src={src}
      alt="IELTStar"
      width={size}
      height={size}
      priority
      className={cn("object-contain", className)}
      style={{ width: size, height: size }}
    />
  );
}

/** Full lockup: star + wordmark (uses the real logo asset when possible). */
export function BrandLockup({ compact = false }: { compact?: boolean }) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  const dark = mounted ? resolvedTheme === "dark" : true;
  return (
    <div className="flex items-center gap-2.5 select-none">
      <Image
        src={dark ? "/ielstar-star-dark.png" : "/ielstar-star-light.png"}
        alt="IELTStar star"
        width={compact ? 30 : 34}
        height={compact ? 30 : 34}
        priority
        className="object-contain"
      />
      <div className="leading-none">
        <div className={cn("font-semibold tracking-tight", compact ? "text-[15px]" : "text-base")}>
          IELTStar
        </div>
        {!compact && (
          <div className="mt-1 text-[10px] font-medium tracking-[0.18em] text-muted-foreground uppercase">
            Speaking Lab
          </div>
        )}
      </div>
    </div>
  );
}
