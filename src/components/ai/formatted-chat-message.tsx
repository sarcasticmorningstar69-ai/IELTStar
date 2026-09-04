"use client";

import * as React from "react";

interface FormattedChatMessageProps {
  text: string;
  className?: string;
}

/**
 * Parses inline formatting: **bold**, *italic*, `code`.
 */
function renderInlineFormatting(line: string): React.ReactNode[] {
  // Regex to tokenize bold (**...**), italic (*...* or _..._), and inline code (`...`)
  const tokenRegex = /(\*\*[^*]+\*\*|\*[^*]+\*|_[^_]+_|`[^`]+`)/g;
  const parts = line.split(tokenRegex);

  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong key={index} className="font-bold text-foreground">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (
      (part.startsWith("*") && part.endsWith("*") && part.length > 2) ||
      (part.startsWith("_") && part.endsWith("_") && part.length > 2)
    ) {
      return (
        <em key={index} className="italic text-foreground/95">
          {part.slice(1, -1)}
        </em>
      );
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <code
          key={index}
          className="rounded border border-border/80 bg-surface/80 px-1.5 py-0.5 font-mono text-[11px] text-brand-bright"
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
 * - Eliminates unsightly raw symbols
 */
export function FormattedChatMessage({ text, className }: FormattedChatMessageProps) {
  if (!text) return null;

  const rawLines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let currentListItems: React.ReactNode[] = [];

  const flushList = (keyPrefix: string) => {
    if (currentListItems.length > 0) {
      elements.push(
        <ul
          key={`${keyPrefix}-list`}
          className="my-2 space-y-1.5 pl-4 text-xs leading-relaxed list-disc marker:text-brand-bright/70"
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
          className="my-3 border-t border-border/60"
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
          className="mt-3 mb-1.5 text-sm font-bold tracking-tight text-foreground first:mt-0"
        >
          {renderInlineFormatting(line.slice(4))}
        </h3>
      );
      return;
    }

    if (line.startsWith("## ")) {
      flushList(`flush-h2-${index}`);
      elements.push(
        <h2
          key={`h2-${index}`}
          className="mt-3.5 mb-1.5 text-base font-bold tracking-tight text-foreground first:mt-0"
        >
          {renderInlineFormatting(line.slice(3))}
        </h2>
      );
      return;
    }

    if (line.startsWith("# ")) {
      flushList(`flush-h1-${index}`);
      elements.push(
        <h1
          key={`h1-${index}`}
          className="mt-4 mb-2 text-lg font-extrabold tracking-tight text-foreground first:mt-0"
        >
          {renderInlineFormatting(line.slice(2))}
        </h1>
      );
      return;
    }

    // 3. Bullet points (- or * or •)
    const bulletMatch = line.match(/^[-*•]\s+(.*)$/);
    if (bulletMatch) {
      currentListItems.push(
        <li key={`li-${index}`} className="text-xs leading-relaxed text-foreground/90">
          {renderInlineFormatting(bulletMatch[1])}
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
          <span className="font-bold text-brand-bright min-w-[1.25rem]">{numberedMatch[1]}.</span>
          <div className="flex-1 text-foreground/90">{renderInlineFormatting(numberedMatch[2])}</div>
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
        className="text-xs leading-relaxed text-foreground/90 break-words [overflow-wrap:anywhere]"
      >
        {renderInlineFormatting(line)}
      </p>
    );
  });

  flushList("flush-end");

  return (
    <div className={`space-y-2 break-words [overflow-wrap:anywhere] ${className || ""}`}>
      {elements}
    </div>
  );
}
