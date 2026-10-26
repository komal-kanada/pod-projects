import { AppShell } from "@pod/ui/rag/app-shell";
import { PageIntro } from "@pod/ui/rag/page-intro";
import charts from "@/eval/ground-truth/charts.json";
import footnotes from "@/eval/ground-truth/footnotes.json";
import tables from "@/eval/ground-truth/tables.json";
import { ExplorerScreen } from "@/components/explorer/explorer-screen";
import { SetupState } from "@/components/setup-state";
import { CONFIG, STRATEGY_IDS, type StrategyId } from "@/lib/config";
import { NAV } from "@/lib/nav";
import { getAppStatus } from "@/lib/server";
import type { GroundTruth } from "@/lib/eval/extraction/ground-truth";

export const dynamic = "force-dynamic";

export default async function ExplorerPage({ searchParams }: PageProps<"/explorer">) {
  const status = await getAppStatus();
  const params = await searchParams;
  const page = Number.parseInt(String(params.page ?? "1"), 10) || 1;
  const available = status.state === "ready" ? STRATEGY_IDS.filter((s) => status.runs[`${s}:typed`] || status.runs[`${s}:flat`]) : [];
  const initial: StrategyId = available.includes(CONFIG.extraction.chosen) ? CONFIG.extraction.chosen : available[0] ?? CONFIG.extraction.chosen;
  const groundTruth = { tables, charts, footnotes, coverage: [] } as unknown as GroundTruth;

  return (
    <AppShell slug="imac-report" nav={NAV}>
      <PageIntro eyebrow="Extraction" title="Document explorer">
        Each page with every extracted element outlined. Select one to see its data, footnote links, the chunks
        derived from it — and how another strategy, or the hand-labelled ground truth, saw it.
      </PageIntro>
      {status.state !== "ready" ? (
        <SetupState status={status} />
      ) : (
        <ExplorerScreen strategies={available} initialStrategy={initial} initialPage={page} groundTruth={groundTruth} />
      )}
    </AppShell>
  );
}
