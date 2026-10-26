"use client";

import { cn } from "../cn";

/**
 * A citation in running text: a small, quiet reference — never louder than
 * the sentence it supports. Clicking highlights the matching source.
 */
export function CitationBadge({
  label,
  title,
  onClick,
  invalid,
}: {
  label: string;
  title?: string;
  onClick?: () => void;
  invalid?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={invalid}
      className={cn(
        "rounded-[6px] px-1.5 py-px align-baseline text-[0.75rem] font-medium whitespace-nowrap tabular-nums transition-colors duration-150",
        invalid
          ? "bg-destructive/10 text-destructive line-through"
          : "bg-brand-soft text-brand-text hover:bg-brand/15",
      )}
    >
      {label}
    </button>
  );
}
