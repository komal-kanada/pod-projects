/**
 * The one list of POD apps. The hub renders its cards from this, and every
 * project page reads its own name and brief from here, so a project is
 * described in exactly one place.
 *
 * `url` is the production address on Vercel. In development every app runs on
 * its own port instead (see each app's `dev` script), so links work locally
 * without touching this file.
 */

export type ProjectStatus = "live" | "in-progress";

export interface PodProject {
  slug: "gpo-report" | "world-bank-report" | "imac-report";
  number: string;
  name: string;
  kind: string;
  brief: string;
  focus: string[];
  status: ProjectStatus;
  /** Production URL. Undefined until the Vercel project exists. */
  url?: string;
  devPort: number;
}

export const HUB = {
  name: "POD",
  /** Production URL of the hub. Undefined until the Vercel project exists. */
  url: "https://pod-projects.vercel.app" as string | undefined,
  devPort: 3000,
};

export const PROJECTS: PodProject[] = [
  {
    slug: "gpo-report",
    number: "01",
    name: "GPO Annual Report",
    kind: "Baseline RAG",
    brief:
      "A clean, measured RAG pipeline — ingestion, chunking, embeddings, retrieval and cited answers — validated against the sample questions.",
    focus: ["Chunking", "Embeddings", "Vector search", "Evaluation"],
    status: "in-progress",
    url: "https://pod-projects-31bc.vercel.app",
    devPort: 3001,
  },
  {
    slug: "world-bank-report",
    number: "02",
    name: "World Bank Economic Report",
    kind: "Advanced document RAG",
    brief:
      "Section-aware retrieval over a ~200-page report: hierarchical chunks, metadata filters, hybrid search, reranking and context budgeting, proven with an ablation.",
    focus: ["Hierarchical chunks", "Hybrid search", "Reranking", "Ablation"],
    status: "in-progress",
    url: "https://pod-projects-35h7.vercel.app",
    devPort: 3002,
  },
  {
    slug: "imac-report",
    number: "03",
    name: "Apple iMac Environmental Report",
    kind: "Multimodal document RAG",
    brief:
      "Answers drawn from tables, charts and footnotes, not just paragraphs — with extraction techniques compared against hand-labelled ground truth.",
    focus: ["Tables", "Charts", "Footnotes", "Vision extraction"],
    status: "in-progress",
    url: "https://pod-projects-utgz.vercel.app",
    devPort: 3003,
  },
];

const isDev = process.env.NODE_ENV === "development";

/** Where to link to an app: its local port in dev, its Vercel URL in production. */
function resolveHref(url: string | undefined, devPort: number) {
  if (isDev) return `http://localhost:${devPort}`;
  return url;
}

export function projectHref(project: PodProject): string | undefined {
  return resolveHref(project.url, project.devPort);
}

export function hubHref(): string | undefined {
  return resolveHref(HUB.url, HUB.devPort);
}

export function getProject(slug: PodProject["slug"]): PodProject {
  const project = PROJECTS.find((p) => p.slug === slug);
  if (!project) throw new Error(`Unknown POD project: ${slug}`);
  return project;
}
