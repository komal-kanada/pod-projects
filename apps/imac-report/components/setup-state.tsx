import { SetupState as SharedSetupState } from "@pod/ui/rag/setup-state";
import type { AppStatus } from "@/lib/server";

export function SetupState({ status }: { status: Exclude<AppStatus, { state: "ready" }> }) {
  return (
    <SharedSetupState
      status={status}
      app="imac-report"
      schema="imac"
      role="imac_app"
      ingestSteps={[
        { label: "Put the report at data/imac-environmental-report.pdf and render it.", command: "pnpm --filter imac-report render" },
        { label: "Extract with every strategy, then score them against your ground truth.", command: "pnpm --filter imac-report extract && pnpm --filter imac-report extract:eval" },
        { label: "Ingest the runs the presets need (publishes page images and crops).", command: "pnpm --filter imac-report ingest --activate" },
      ]}
    />
  );
}
