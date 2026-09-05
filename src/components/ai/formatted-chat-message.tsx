"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface FormattedChatMessageProps {
  text: string;
  className?: string;
  isUser?: boolean;
}

/**
 * Parses inline formatting: **bold**, *italic*, `code`.
 */
function renderInlineFormatting(line: string, isUser: boolean = false): React.ReactNode[] {
  // Regex to tokenize bold (**...**), italic (*...* or _..._), and inline code (`...`)
  const tokenRegex = /(\*\*[^*]+\*\*|\*[^*]+\*|_[^_]+_|`[^`]+`)/g;
  const parts = line.split(tokenRegex);

  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong
          key={index}
          className={cn("font-bold", isUser ? "text-white" : "text-foreground")}
        >
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (
      (part.startsWith("*") && part.endsWith("*") && part.length > 2) ||
      (part.startsWith("_") && part.endsWith("_") && part.length > 2)
    ) {
      return (
        <em
          key={index}
          className={cn("italic", isUser ? "text-white/95" : "text-foreground/95")}
        >
          {part.slice(1, -1)}
        </em>
      );
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <code
          key={index}
          className={cn(
            "rounded px-1.5 py-0.5 font-mono text-[11px]",
            isUser
              ? "border border-white/20 bg-white/15 text-white"
              : "border border-border/80 bg-surface/80 text-brand-bright"
          )}
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}

/**
 * FormattedChatMessage
 *
 * Renders Markdown-style text with distinct visual hierarchy:
 * - H1, H2, H3 headings with tailored font sizes and bold weights
 * - Dividers (---) as subtle styled horizontal rules instead of raw characters
 * - Clean bulleted lists
 * - Rich bold and italic typography
 * - High-contrast white rendering when isUser is true
 */
export function FormattedChatMessage({
  text,
  className,
  isUser = false,
}: FormattedChatMessageProps) {
  if (!text) return null;

  const rawLines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let currentListItems: React.ReactNode[] = [];

  const flushList = (keyPrefix: string) => {
    if (currentListItems.length > 0) {
      elements.push(
        <ul
          key={`${keyPrefix}-list`}
          className={cn(
            "my-2 space-y-1.5 pl-4 text-xs leading-relaxed list-disc",
            isUser ? "marker:text-white/80" : "marker:text-brand-bright/70"
          )}
        >
          {currentListItems}
        </ul>
      );
      currentListItems = [];
    }
  };

  rawLines.forEach((rawLine, index) => {
    const line = rawLine.trim();

    // 1. Horizontal dividers
    if (line === "---" || line === "***" || line === "___") {
      flushList(`flush-div-${index}`);
      elements.push(
        <hr
          key={`hr-${index}`}
          className={cn("my-3 border-t", isUser ? "border-white/20" : "border-border/60")}
        />
      );
      return;
    }

    // 2. Headings
    if (line.startsWith("### ")) {
      flushList(`flush-h3-${index}`);
      elements.push(
        <h3
          key={`h3-${index}`}
          className={cn(
            "mt-3 mb-1.5 text-sm font-bold tracking-tight first:mt-0",
            isUser ? "text-white" : "text-foreground"
          )}
        >
          {renderInlineFormatting(line.slice(4), isUser)}
        </h3>
      );
      return;
    }

    if (line.startsWith("## ")) {
      flushList(`flush-h2-${index}`);
      elements.push(
        <h2
          key={`h2-${index}`}
          className={cn(
            "mt-3.5 mb-1.5 text-base font-bold tracking-tight first:mt-0",
            isUser ? "text-white" : "text-foreground"
          )}
        >
          {renderInlineFormatting(line.slice(3), isUser)}
        </h2>
      );
      return;
    }

    if (line.startsWith("# ")) {
      flushList(`flush-h1-${index}`);
      elements.push(
        <h1
          key={`h1-${index}`}
          className={cn(
            "mt-4 mb-2 text-lg font-extrabold tracking-tight first:mt-0",
            isUser ? "text-white" : "text-foreground"
          )}
        >
          {renderInlineFormatting(line.slice(2), isUser)}
        </h1>
      );
      return;
    }

    // 3. Bullet points (- or * or •)
    const bulletMatch = line.match(/^[-*•]\s+(.*)$/);
    if (bulletMatch) {
      currentListItems.push(
        <li
          key={`li-${index}`}
          className={cn("text-xs leading-relaxed", isUser ? "text-white/95" : "text-foreground/90")}
        >
          {renderInlineFormatting(bulletMatch[1], isUser)}
        </li>
      );
      return;
    }

    // 4. Numbered list items (1. Item)
    const numberedMatch = line.match(/^(\d+)\.\s+(.*)$/);
    if (numberedMatch) {
      flushList(`flush-num-${index}`);
      elements.push(
        <div key={`num-${index}`} className="flex items-start gap-2 my-1 text-xs leading-relaxed">
          <span
            className={cn(
              "font-bold min-w-[1.25rem]",
              isUser ? "text-white/90" : "text-brand-bright"
            )}
          >
            {numberedMatch[1]}.
          </span>
          <div
            className={cn(
              "flex-1",
              isUser ? "text-white/95" : "text-foreground/90"
            )}
          >
            {renderInlineFormatting(numberedMatch[2], isUser)}
          </div>
        </div>
      );
      return;
    }

    // 5. Empty line (paragraph break)
    if (!line) {
      flushList(`flush-empty-${index}`);
      return;
    }

    // 6. Regular paragraph text
    flushList(`flush-para-${index}`);
    elements.push(
      <p
        key={`p-${index}`}
        className={cn(
          "text-xs leading-relaxed break-words [overflow-wrap:anywhere]",
          isUser ? "text-white font-normal" : "text-foreground/90 font-normal"
        )}
      >
        {renderInlineFormatting(line, isUser)}
      </p>
    );
  });

  flushList("flush-end");

  return (
    <div
      className={cn(
        "space-y-2 break-words [overflow-wrap:anywhere]",
        isUser && "text-white [&_*]:text-white",
        className
      )}
    >
      {elements}
    </div>
  );
}
