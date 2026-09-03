"use client";

import * as React from "react";
import { animateWindowEntrance } from "@/lib/animation/anime-engine";
import { cn } from "@/lib/utils";

export function WindowTransition({
  children,
  viewKey,
  className,
}: {
  children: React.ReactNode;
  viewKey: string;
  className?: string;
}) {
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (containerRef.current) {
      animateWindowEntrance(containerRef.current);
    }
  }, [viewKey]);

  return (
    <div ref={containerRef} className={cn("will-change-[transform,opacity]", className)}>
      {children}
    </div>
  );
}
