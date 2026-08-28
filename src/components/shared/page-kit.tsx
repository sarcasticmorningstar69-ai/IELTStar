"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { StarMark } from "@/components/shared/brand";

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
  className,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-6 flex flex-wrap items-end justify-between gap-4", className)}>
      <div className="min-w-0">
        {eyebrow && (
          <div className="mb-1.5 text-[11px] font-semibold tracking-[0.16em] text-brand-bright uppercase">
            {eyebrow}
          </div>
        )}
        <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-[28px]">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-muted-foreground text-pretty">
            {subtitle}
          </p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
  className,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-dashed border-border bg-surface px-6 py-12 text-center",
        className
      )}
    >
      <div className="pointer-events-none absolute -top-10 right-8 opacity-[0.06]">
        <StarMark size={150} />
      </div>
      <div className="relative">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center">
          <StarMark size={38} />
        </div>
        <h3 className="text-base font-semibold tracking-tight">{title}</h3>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
          {body}
        </p>
        {action && <div className="mt-6 flex justify-center">{action}</div>}
      </div>
    </div>
  );
}

type Tone = "neutral" | "brand" | "success" | "warning";

const TONES: Record<Tone, string> = {
  neutral: "border-border text-muted-foreground",
  brand: "border-brand-bright/45 text-brand-bright",
  success: "border-success/50 text-success",
  warning: "border-warning/50 text-warning",
};

export function StatusPill({
  tone = "neutral",
  icon,
  children,
  className,
}: {
  tone?: Tone;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium tracking-wide",
        TONES[tone],
        className
      )}
    >
      {icon}
      {children}
    </span>
  );
}

export function SectionCard({
  title,
  hint,
  children,
  className,
  contentClassName,
}: {
  title?: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-border bg-card p-5 shadow-[0_1px_2px_rgb(0_0_0_/_0.04)] sm:p-6",
        className
      )}
    >
      {(title || hint) && (
        <div className="mb-4 flex items-baseline justify-between gap-3">
          {title && (
            <h2 className="text-sm font-semibold tracking-[0.08em] text-muted-foreground uppercase">
              {title}
            </h2>
          )}
          {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
        </div>
      )}
      <div className={contentClassName}>{children}</div>
    </section>
  );
}
