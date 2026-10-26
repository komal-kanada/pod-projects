import { Wrench } from "lucide-react";

/**
 * Shown instead of an error when the app isn't wired up yet (no database URL,
 * no Gemini key, or the report hasn't been ingested). Says exactly what's
 * missing and the command that fixes it.
 */
export function SetupNotice({
  title = "This app isn't connected yet",
  missing,
  steps,
}: {
  title?: string;
  missing: string[];
  steps: { label: string; command?: string }[];
}) {
  return (
    <section className="surface border-caution/40 bg-caution/[0.06] p-5 sm:p-6" aria-live="polite">
      <div className="flex items-start gap-3">
        <span className="bg-caution/15 text-caution flex size-8 shrink-0 items-center justify-center rounded-full">
          <Wrench className="size-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="text-[0.9375rem] font-medium">{title}</h2>
          {missing.length ? (
            <p className="text-muted-foreground mt-1 text-sm">
              Missing: {missing.join(", ")}
            </p>
          ) : null}
          <ol className="mt-4 space-y-2.5 text-sm">
            {steps.map((step, index) => (
              <li key={step.label} className="flex gap-2.5">
                <span className="text-muted-foreground w-4 shrink-0 tabular-nums">{index + 1}.</span>
                <span className="min-w-0">
                  {step.label}
                  {step.command ? (
                    <code className="bg-surface-2 mt-1 block overflow-x-auto rounded-[8px] px-2.5 py-1.5 font-mono text-[0.8125rem]">
                      {step.command}
                    </code>
                  ) : null}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
