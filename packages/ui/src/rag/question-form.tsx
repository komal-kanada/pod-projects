"use client";

import { useId, type FormEvent, type KeyboardEvent } from "react";
import { ArrowUp, Square } from "lucide-react";
import { cn } from "../cn";

/**
 * The question box. Enter asks, Shift+Enter adds a line. While an answer is
 * streaming the button becomes Stop, so a slow answer is never a trap.
 */
export function QuestionForm({
  value,
  onChange,
  onSubmit,
  onStop,
  busy,
  placeholder = "Ask a question about the report…",
  label = "Your question",
  maxLength = 500,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (question: string) => void;
  onStop?: () => void;
  busy: boolean;
  placeholder?: string;
  label?: string;
  maxLength?: number;
  /** Extra controls shown under the box (preset select, top-k…). */
  children?: React.ReactNode;
}) {
  const id = useId();
  const trimmed = value.trim();
  const canAsk = !busy && trimmed.length >= 3;

  function submit(event?: FormEvent) {
    event?.preventDefault();
    if (canAsk) onSubmit(trimmed);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <form onSubmit={submit} className="surface p-2 sm:p-2.5">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <div className="flex items-end gap-2">
        <textarea
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          maxLength={maxLength}
          rows={2}
          className="placeholder:text-muted-foreground/80 max-h-48 min-h-[3.25rem] flex-1 resize-none bg-transparent px-3 py-2.5 text-[1rem] leading-relaxed outline-none focus-visible:outline-none"
        />
        {busy && onStop ? (
          <button
            type="button"
            onClick={onStop}
            aria-label="Stop answering"
            className="press bg-ink text-ink-foreground flex size-11 shrink-0 items-center justify-center rounded-full"
          >
            <Square className="size-3.5 fill-current" aria-hidden />
          </button>
        ) : (
          <button
            type="submit"
            disabled={!canAsk}
            aria-label="Ask"
            className={cn(
              "press flex size-11 shrink-0 items-center justify-center rounded-full transition-colors duration-150",
              canAsk ? "bg-brand text-brand-foreground" : "bg-surface-2 text-muted-foreground",
            )}
          >
            <ArrowUp className="size-4.5" aria-hidden />
          </button>
        )}
      </div>
      {children ? (
        <div className="border-hairline mt-1.5 flex flex-wrap items-center gap-2 border-t px-2 pt-2">
          {children}
        </div>
      ) : null}
    </form>
  );
}
