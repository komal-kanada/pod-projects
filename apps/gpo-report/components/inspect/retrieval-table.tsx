import { ScoreBar, Tag } from "@pod/ui/rag/states";
import { formatMs } from "@pod/ui/rag/trace-panel";
import { pageLabel, type RetrievalResult } from "@/lib/types";

/** Rank, score, (vector/keyword ranks in hybrid mode), pages, section, preview. */
export function RetrievalTable({ result }: { result: RetrievalResult }) {
  const hybrid = result.mode === "hybrid";
  return (
    <div className="surface overflow-hidden">
      <p className="text-muted-foreground border-hairline flex flex-wrap gap-x-3 border-b px-4 py-3 text-[0.8125rem] tabular-nums">
        <span>Run {result.runId.slice(0, 8)}</span>
        <span aria-hidden>·</span>
        <span>{result.mode}, k={result.topK}</span>
        <span aria-hidden>·</span>
        <span>embed {formatMs(result.embeddingMs)}</span>
        <span aria-hidden>·</span>
        <span>search {formatMs(result.searchMs)}</span>
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[0.8125rem]">
          <thead className="bg-surface-2 text-muted-foreground">
            <tr>
              <th scope="col" className="px-4 py-2.5 font-medium">Rank</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Similarity</th>
              {hybrid ? (
                <>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium">vRank</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium">kRank</th>
                </>
              ) : null}
              <th scope="col" className="px-4 py-2.5 font-medium">Pages</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Section · preview</th>
            </tr>
          </thead>
          <tbody>
            {result.chunks.map((chunk) => (
              <tr key={chunk.chunkId} className="border-hairline hover:bg-surface-2/60 border-t align-top">
                <td className="px-4 py-3 tabular-nums">{chunk.rank}</td>
                <td className="px-4 py-3">
                  <ScoreBar value={chunk.similarity} />
                </td>
                {hybrid ? (
                  <>
                    <td className="px-3 py-3 text-right tabular-nums">{chunk.vectorRank ?? "–"}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{chunk.keywordRank ?? "–"}</td>
                  </>
                ) : null}
                <td className="px-4 py-3">
                  <Tag tone="brand">{pageLabel(chunk.pageLabelStart ?? chunk.pageStart, chunk.pageLabelEnd ?? chunk.pageEnd)}</Tag>
                </td>
                <td className="max-w-[40rem] px-4 py-3">
                  <p className="font-medium">{chunk.sectionPath || "—"}</p>
                  <p className="text-muted-foreground mt-1 line-clamp-2">{chunk.content}</p>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {result.chunks.length === 0 ? <p className="text-muted-foreground p-4 text-sm">Nothing retrieved.</p> : null}
    </div>
  );
}
