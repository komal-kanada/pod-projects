import { PodHeader } from "@pod/ui/pod-header";
import { ProjectCard } from "@pod/ui/project-card";
import { PROJECTS } from "@pod/ui/projects";

export default function HubPage() {
  const live = PROJECTS.filter((p) => p.status === "live").length;

  return (
    <div className="flex min-h-dvh flex-col">
      <PodHeader />

      <main className="mx-auto w-full max-w-5xl flex-1 px-5 pb-20 sm:px-7">
        <section className="animate-rise pt-14 pb-12 sm:pt-24 sm:pb-16">
          <p className="eyebrow">Welcome to Asfaqe Hussain&apos;s POD</p>
          <h1 className="mt-5 max-w-[20ch] text-[2.5rem] leading-[1.04] font-medium tracking-[-0.03em] sm:text-[3.75rem]">
            Four RAG projects.
            <span className="text-muted-foreground block">
              Each on a harder kind of document.
            </span>
          </h1>
          <p className="text-muted-foreground mt-7 max-w-[54ch] text-[1.0625rem] leading-relaxed sm:text-[1.125rem]">
            From your own study notes, to a baseline pipeline, to a 200-page
            economic report, to answers hidden in tables, charts and footnotes.
            Pick a project to open it.
          </p>
          <p className="text-muted-foreground mt-6 text-sm">
            <span className="text-foreground font-medium">{live}</span> live
            {" · "}
            <span className="text-foreground font-medium">
              {PROJECTS.length - live}
            </span>{" "}
            in progress
          </p>
        </section>

        <section aria-label="Projects">
          <ul className="grid gap-4 md:grid-cols-2">
            {PROJECTS.map((project) => (
              <li key={project.slug}>
                <ProjectCard project={project} />
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer className="border-hairline border-t">
        <div className="text-muted-foreground mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-2 px-5 py-6 text-sm sm:px-7">
          <span>Built with Next.js, Gemini and Supabase</span>
          <span>Each project runs as its own app</span>
        </div>
      </footer>
    </div>
  );
}
