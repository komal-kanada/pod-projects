import type { ReactNode } from "react";
import Link from "next/link";
import { getProject, hubHref, type PodProject } from "../projects";
import { PodMark } from "../pod-mark";
import { ThemeToggle } from "../theme-toggle";
import { NavLinks, type NavItem } from "./nav-links";

/**
 * The frame every POD RAG app shares: hub mark, project name, the app's own
 * screens, theme toggle, and a footer that says what the app is. Wide
 * (max-w-6xl) because these are research tools with side-by-side panels.
 */
export function AppShell({
  slug,
  nav,
  children,
}: {
  slug: PodProject["slug"];
  nav: NavItem[];
  children: ReactNode;
}) {
  const project = getProject(slug);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-hairline bg-background/85 sticky top-0 z-20 border-b backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3 sm:px-7">
          <div className="flex min-w-0 items-center gap-3">
            <PodMark href={hubHref()} />
            <span aria-hidden className="text-hairline text-lg">
              /
            </span>
            <Link href="/" className="truncate text-sm font-medium">
              {project.name}
            </Link>
          </div>
          <div className="order-3 w-full sm:order-none sm:ml-4 sm:w-auto">
            <NavLinks items={nav} />
          </div>
          <ThemeToggle className="ml-auto" />
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-5 pt-8 pb-20 sm:px-7 sm:pt-12">
        {children}
      </main>

      <footer className="border-hairline border-t">
        <div className="text-muted-foreground mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-2 px-5 py-5 text-[0.8125rem] sm:px-7">
          <span>
            Project {project.number} · {project.kind}
          </span>
          <span>Answers come only from the report, with page citations</span>
        </div>
      </footer>
    </div>
  );
}
