"use client";

import { Children, isValidElement, cloneElement, type ReactNode } from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { segmentCitations } from "@pod/rag/citations";

/**
 * Renders an answer's markdown and turns every `[n]` / `[n, m]` into a
 * citation badge the app draws (page, section, element type…). Badges are
 * produced in code from the sources, so the model never writes page numbers.
 */
export function AnswerMarkdown({
  text,
  renderCitation,
  streaming,
}: {
  text: string;
  renderCitation: (n: number) => ReactNode;
  streaming?: boolean;
}) {
  function withCitations(children: ReactNode): ReactNode {
    return Children.map(children, (child) => {
      if (typeof child === "string") {
        return segmentCitations(child).map((segment, index) =>
          segment.kind === "text" ? (
            segment.text
          ) : (
            <span key={index} className="inline-flex gap-0.5 align-baseline">
              {segment.numbers.map((n) => (
                <span key={n}>{renderCitation(n)}</span>
              ))}
            </span>
          ),
        );
      }
      if (isValidElement<{ children?: ReactNode }>(child) && child.props.children) {
        return cloneElement(child, undefined, withCitations(child.props.children));
      }
      return child;
    });
  }

  function cite(Tag: "p" | "li" | "td" | "th" | "strong" | "em") {
    function WithCitations({ children }: { children?: ReactNode }) {
      return <Tag>{withCitations(children)}</Tag>;
    }
    WithCitations.displayName = `Cite(${Tag})`;
    return WithCitations;
  }

  const components: Components = {
    p: cite("p"),
    li: cite("li"),
    td: cite("td"),
    th: cite("th"),
    strong: cite("strong"),
    em: cite("em"),
    table: ({ children }) => (
      <div className="border-hairline my-4 overflow-x-auto rounded-tight border">
        <table>{children}</table>
      </div>
    ),
  };

  return (
    <div className="answer-prose">
      <Markdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </Markdown>
      {streaming ? (
        <span aria-hidden className="bg-brand animate-sheen ml-0.5 inline-block h-[1.1em] w-[2px] translate-y-[3px]" />
      ) : null}
    </div>
  );
}
