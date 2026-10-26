import { ArrowLeft, Check } from "lucide-react";
import { cn } from "./cn";
import { getProject, hubHref, type PodProject } from "./projects";
import { PodHeader } from "./pod-header";
import { StatusPill } from "./status-pill";

const STAGES = [
  { label: "Plan and docs", done: true },
  { label: "App skeleton deployed", done: true },
  { label: "Core RAG pipeline", done: false },
  { label: "Evaluation with sample questions", done: false },
];

/**
 * The "hello world" page every new POD project shows until its core build
 * lands: what the project is, what it will demonstrate, and where it stands.
 */
export function ProjectPlaceholder({ slug }: { slug: PodProject["slug"] }) {
  const project = getProject(slug);
  const hub = hubHref();

  return (
    <div className="flex min-h-dvh flex-col">
      <PodHeader section={`Project ${project.number}`} />

      <main className="mx-auto w-full max-w-5xl flex-1 px-5 pb-20 sm:px-7">
        <section className="animate-rise pt-14 sm:pt-20">
          <div className="flex flex-wrap items-center gap-3">
            <span className="eyebrow">Project {project.number}</span>
            <StatusPill status={project.status} />
          </div>

          <h1 className="mt-5 max-w-[20ch] text-[2.25rem] leading-[1.06] font-medium tracking-[-0.03em] sm:text-[3.25rem]">
            {project.name}
          </h1>
          <p className="text-brand-text mt-3 text-lg font-medium">
            {project.kind}
          </p>
          <p className="text-muted-foreground mt-6 max-w-[58ch] text-[1.0625rem] leading-relaxed">
            {project.brief}
          </p>
        </section>

        <section
          aria-label="Project overview"
          className="mt-12 grid gap-4 sm:mt-16 md:grid-cols-2"
        >
          <div className="surface p-6 sm:p-7">
            <h2 className="eyebrow">What it will show</h2>
            <ul className="mt-5 flex flex-wrap gap-2">
              {project.focus.map((item) => (
                <li
                  key={item}
                  className="bg-surface-2 text-secondary-foreground rounded-full px-3 py-1.5 text-sm"
                >
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="surface p-6 sm:p-7">
            <h2 className="eyebrow">Where it stands</h2>
            <ol className="mt-5 space-y-3">
              {STAGES.map((stage) => (
                <li key={stage.label} className="flex items-center gap-3 text-sm">
                  <span
                    aria-hidden
                    className={cn(
                      "flex size-5 shrink-0 items-center justify-center rounded-full border",
                      stage.done
                        ? "bg-positive border-transparent text-white"
                        : "border-hairline",
                    )}
                  >
                    {stage.done ? <Check className="size-3" /> : null}
                  </span>
                  <span
                    className={stage.done ? "text-foreground" : "text-muted-foreground"}
                  >
                    {stage.label}
                    <span className="sr-only">
                      {stage.done ? " (done)" : " (not started)"}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {hub ? (
          <a
            href={hub}
            className="press border-hairline bg-surface rounded-panel mt-10 inline-flex h-11 items-center gap-2 border px-5 text-[0.9375rem] font-medium"
          >
            <ArrowLeft className="size-4" aria-hidden />
            All POD projects
          </a>
        ) : null}
      </main>
    </div>
  );
}
