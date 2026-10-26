import { AlertCircle, Gauge, Info } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../cn";

/** An error the person can act on, with an optional retry. */
export function ErrorNote({ message, action }: { message: string; action?: ReactNode }) {
  return (
    <div
      role="alert"
      className="border-destructive/25 bg-destructive/[0.06] rounded-panel flex flex-wrap items-center gap-3 border px-4 py-3 text-sm"
    >
      <AlertCircle className="text-destructive size-4 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1">{message}</span>
      {action}
    </div>
  );
}

/**
 * The app's Gemini quota is used up for the day. Not the visitor's fault and
 * not fixed by retrying, so it gets its own look and no "Try again" button.
 */
export function QuotaNote({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="border-caution/30 bg-caution/[0.08] rounded-panel flex items-start gap-3 border px-4 py-3 text-sm"
    >
      <Gauge className="text-caution mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-medium">Daily AI quota reached</p>
        <p className="text-muted-foreground mt-0.5">{message}</p>
      </div>
    </div>
  );
}

/** A failed request: the quota alert when that's the cause, otherwise an error with the given action. */
export function FailureNote({ message, code, action }: { message: string; code?: string | null; action?: ReactNode }) {
  return code === "quota" ? <QuotaNote message={message} /> : <ErrorNote message={message} action={action} />;
}

/** Neutral information — e.g. a refusal is an answer, not an error. */
export function InfoNote({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("bg-surface-2 rounded-panel flex items-start gap-3 px-4 py-3 text-sm", className)}>
      <Info className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** Loading placeholder shaped like the content it stands in for. */
export function SkeletonLines({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("space-y-2.5", className)} aria-hidden>
      {Array.from({ length: lines }, (_, index) => (
        <div
          key={index}
          className="bg-surface-2 animate-sheen h-3.5 rounded-full"
          style={{ width: `${index === lines - 1 ? 55 : 100 - index * 6}%` }}
        />
      ))}
    </div>
  );
}

/** Small label: "p. 12–13", "table", "B5". */
export function Tag({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "brand" | "positive" | "caution";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.75rem] font-medium whitespace-nowrap",
        tone === "neutral" && "bg-surface-2 text-secondary-foreground",
        tone === "brand" && "bg-brand-soft text-brand-text",
        tone === "positive" && "bg-positive/12 text-positive",
        tone === "caution" && "bg-caution/15 text-caution",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** A 0–1 score as a thin bar plus the number — never colour alone. */
export function ScoreBar({ value, label }: { value: number; label?: string }) {
  const clamped = Math.max(0, Math.min(1, value));
  return (
    <span className="inline-flex items-center gap-2" title={label}>
      <span className="bg-surface-2 h-1.5 w-14 overflow-hidden rounded-full" aria-hidden>
        <span className="bg-brand/70 block h-full rounded-full" style={{ width: `${clamped * 100}%` }} />
      </span>
      <span className="text-muted-foreground text-[0.75rem] tabular-nums">{value.toFixed(2)}</span>
    </span>
  );
}
