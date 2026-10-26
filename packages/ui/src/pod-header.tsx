import { hubHref } from "./projects";
import { PodMark } from "./pod-mark";
import { ThemeToggle } from "./theme-toggle";

/** Top bar shared by every POD app. The mark always leads back to the hub. */
export function PodHeader({ section }: { section?: string }) {
  return (
    <header className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-5 py-4 sm:px-7">
      <div className="flex min-w-0 items-center gap-3">
        <PodMark href={hubHref()} />
        {section ? (
          <>
            <span aria-hidden className="text-hairline text-lg">
              /
            </span>
            <span className="text-muted-foreground truncate text-sm">
              {section}
            </span>
          </>
        ) : null}
      </div>
      <ThemeToggle />
    </header>
  );
}
