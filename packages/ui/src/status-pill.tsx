import { cn } from "./cn";
import type { ProjectStatus } from "./projects";

const LABEL: Record<ProjectStatus, string> = {
  live: "Live",
  "in-progress": "In progress",
};

/** Status is shown as text plus a dot, never colour alone. */
export function StatusPill({ status }: { status: ProjectStatus }) {
  return (
    <span className="border-hairline bg-surface-2 text-muted-foreground inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium">
      <span
        aria-hidden
        className={cn(
          "size-1.5 rounded-full",
          status === "live" ? "bg-positive" : "bg-caution",
        )}
      />
      {LABEL[status]}
    </span>
  );
}
