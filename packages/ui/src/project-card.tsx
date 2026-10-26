import { ArrowUpRight } from "lucide-react";
import { cn } from "./cn";
import { projectHref, type PodProject } from "./projects";
import { StatusPill } from "./status-pill";

/** One project on the hub. The whole card is the link. */
export function ProjectCard({ project }: { project: PodProject }) {
  const href = projectHref(project);

  const body = (
    <>
      <div className="flex items-center justify-between gap-3">
        <span className="eyebrow">Project {project.number}</span>
        <StatusPill status={project.status} />
      </div>

      <h2 className="mt-5 text-[1.375rem] leading-tight font-medium sm:text-[1.5rem]">
        {project.name}
      </h2>
      <p className="text-brand-text mt-1 text-sm font-medium">{project.kind}</p>

      <p className="text-muted-foreground mt-4 text-[0.9375rem] leading-relaxed">
        {project.brief}
      </p>

      <ul className="mt-5 flex flex-wrap gap-1.5" aria-label="Focus">
        {project.focus.map((item) => (
          <li
            key={item}
            className="bg-surface-2 text-secondary-foreground rounded-full px-2.5 py-1 text-xs"
          >
            {item}
          </li>
        ))}
      </ul>

      <div className="mt-auto pt-7">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 text-sm font-medium",
            href ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {href ? "Open project" : "Link coming soon"}
          {href ? (
            <ArrowUpRight
              className="size-4 transition-transform duration-200 ease-[var(--ease-ios)] group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
              aria-hidden
            />
          ) : null}
        </span>
      </div>
    </>
  );

  const classes =
    "group border-hairline bg-surface rounded-surface flex h-full flex-col border p-6 shadow-soft sm:p-7";

  return href ? (
    <a
      href={href}
      className={cn(
        classes,
        "press hover:shadow-raised transition-shadow duration-200 ease-[var(--ease-ios)]",
      )}
    >
      {body}
    </a>
  ) : (
    <div className={classes} aria-disabled>
      {body}
    </div>
  );
}
