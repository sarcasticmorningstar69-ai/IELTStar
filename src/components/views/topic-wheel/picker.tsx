"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { wrapIndex, type WheelTopic } from "@/lib/data/topic-wheel";

/**
 * Compact vertical picker. Kept deliberately short so the wheel, the controls
 * and the timer all stay inside one viewport without scrolling.
 */
export const ITEM_H = 52;
export const VISIBLE = 5;
const MID = 2;

export function TopicPicker({
  topics,
  index,
  onIndexChange,
  spinning,
}: {
  topics: WheelTopic[];
  index: number;
  onIndexChange: (next: number) => void;
  spinning: boolean;
}) {
  const n = topics.length;
  const drag = React.useRef<{ y: number; acc: number } | null>(null);

  const items = React.useMemo(() => {
    if (!n) return [];
    const out: { topic: WheelTopic; dist: number }[] = [];
    for (let d = -MID; d <= MID; d++) {
      out.push({ topic: topics[wrapIndex(index + d, n)], dist: d });
    }
    return out;
  }, [index, n, topics]);

  const nudge = React.useCallback(
    (dir: number) => {
      if (spinning || !n) return;
      onIndexChange(wrapIndex(index + dir, n));
    },
    [index, n, onIndexChange, spinning]
  );

  return (
    <div
      className="relative mx-auto w-full max-w-2xl touch-pan-y select-none"
      style={{ height: ITEM_H * VISIBLE }}
      onWheel={(e) => {
        if (Math.abs(e.deltaY) < 6) return;
        e.preventDefault();
        nudge(e.deltaY > 0 ? 1 : -1);
      }}
      onPointerDown={(e) => {
        if (spinning) return;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        drag.current = { y: e.clientY, acc: 0 };
      }}
      onPointerMove={(e) => {
        if (!drag.current || spinning) return;
        const dy = e.clientY - drag.current.y;
        drag.current.y = e.clientY;
        drag.current.acc += dy;
        while (drag.current.acc > ITEM_H / 2) {
          drag.current.acc -= ITEM_H;
          nudge(-1);
        }
        while (drag.current.acc < -ITEM_H / 2) {
          drag.current.acc += ITEM_H;
          nudge(1);
        }
      }}
      onPointerUp={() => {
        drag.current = null;
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
      role="listbox"
      aria-label="Speaking topic picker"
      aria-activedescendant={topics[index]?.id}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-20 bg-gradient-to-b from-background via-background/75 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-20 bg-gradient-to-t from-background via-background/75 to-transparent" />
      <div className="relative z-[5] flex h-full flex-col justify-center">
        {items.map(({ topic, dist }) => {
          const abs = Math.abs(dist);
          const selected = dist === 0;
          return (
            <div
              key={`${topic.id}:${dist}`}
              id={selected ? topic.id : undefined}
              role="option"
              aria-selected={selected}
              className={cn(
                "flex w-full items-center justify-center px-5 text-center",
                selected ? "text-brand-bright" : "text-foreground"
              )}
              style={{
                height: ITEM_H,
                opacity: selected ? 1 : Math.max(0.12, 1 - abs * 0.34),
                filter: selected ? "none" : `blur(${Math.min(2.6, abs * 0.9)}px)`,
                transform: `scale(${selected ? 1.02 : 1 - abs * 0.045})`,
                fontSize: selected ? 17 : 14,
                fontWeight: selected ? 600 : 400,
                letterSpacing: selected ? "-0.021em" : "-0.01em",
                lineHeight: 1.3,
              }}
            >
              <span
                className="max-w-[38rem] text-balance"
                style={
                  selected
                    ? undefined
                    : {
                        display: "-webkit-box",
                        WebkitLineClamp: 1,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }
                }
              >
                {topic.prompt}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
