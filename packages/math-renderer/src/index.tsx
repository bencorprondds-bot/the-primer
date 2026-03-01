"use client";

import katex from "katex";
import React, { useMemo } from "react";

/**
 * Renders a LaTeX math expression inline.
 * Usage: <InlineMath math="x^2 + y^2 = z^2" />
 */
export function InlineMath({ math }: { math: string }) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(math, {
        displayMode: false,
        throwOnError: false,
        strict: false,
      });
    } catch {
      return `<span class="text-red-500">[Math Error: ${math}]</span>`;
    }
  }, [math]);

  return (
    <span
      dangerouslySetInnerHTML={{ __html: html }}
      aria-label={`math: ${math}`}
      role="math"
    />
  );
}

/**
 * Renders a LaTeX math expression as a display block.
 * Usage: <BlockMath math="\frac{a}{b} = c" />
 */
export function BlockMath({ math }: { math: string }) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(math, {
        displayMode: true,
        throwOnError: false,
        strict: false,
      });
    } catch {
      return `<span class="text-red-500">[Math Error: ${math}]</span>`;
    }
  }, [math]);

  return (
    <div
      dangerouslySetInnerHTML={{ __html: html }}
      aria-label={`math: ${math}`}
      role="math"
      className="my-4"
    />
  );
}

/**
 * Renders mixed text and math content.
 * Parses $...$ for inline math and $$...$$ for display math.
 *
 * Usage: <MathText content="Simplify $3 + 4 \times 2$ using order of operations." />
 */
export function MathText({ content }: { content: string }) {
  const parts = useMemo(() => {
    const result: React.ReactNode[] = [];
    // Match $$...$$ (display) first, then $...$ (inline)
    const regex = /\$\$([\s\S]*?)\$\$|\$([\s\S]*?)\$/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(content)) !== null) {
      // Add text before the match
      if (match.index > lastIndex) {
        result.push(
          <span key={`text-${lastIndex}`}>
            {content.slice(lastIndex, match.index)}
          </span>
        );
      }

      if (match[1] !== undefined) {
        // Display math ($$...$$)
        result.push(<BlockMath key={`block-${match.index}`} math={match[1]} />);
      } else if (match[2] !== undefined) {
        // Inline math ($...$)
        result.push(
          <InlineMath key={`inline-${match.index}`} math={match[2]} />
        );
      }

      lastIndex = match.index + match[0].length;
    }

    // Add remaining text
    if (lastIndex < content.length) {
      result.push(
        <span key={`text-${lastIndex}`}>{content.slice(lastIndex)}</span>
      );
    }

    return result;
  }, [content]);

  return <>{parts}</>;
}
