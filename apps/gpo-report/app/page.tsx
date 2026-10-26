import { AppShell } from "@pod/ui/rag/app-shell";
import { AskScreen } from "@/components/ask/ask-screen";
import { PageIntro } from "@pod/ui/rag/page-intro";
import { RunBadge } from "@/components/run-badge";
import { SetupState } from "@/components/setup-state";
import { NAV } from "@/lib/nav";
import { sampleQuestions } from "@/lib/samples";
import { getAppStatus } from "@/lib/server";

export const dynamic = "force-dynamic";

export default async function AskPage() {
  const status = await getAppStatus();

  return (
    <AppShell slug="gpo-report" nav={NAV}>
      <PageIntro
        eyebrow="Project 02 · Baseline RAG"
        title="Ask the GPO Annual Report"
        aside={status.state === "ready" ? <RunBadge run={status.run} /> : null}
      >
        Answers come only from the report, with every claim tied to the page it came from. If the report
        doesn’t say, the app says so.
      </PageIntro>

      {status.state !== "ready" ? (
        <div className="mb-8">
          <SetupState status={status} />
        </div>
      ) : null}

      <AskScreen samples={sampleQuestions()} enabled={status.state === "ready"} />
    </AppShell>
  );
}
