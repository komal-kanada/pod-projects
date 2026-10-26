"use client";

import { useEffect, useState } from "react";
import { ErrorNote, SkeletonLines, Tag } from "@pod/ui/rag/states";
import { norm, similarity } from "@/lib/eval/extraction/score";
import type { GroundTruth } from "@/lib/eval/extraction/ground-truth";
import type { ChartSeries, StoredElement } from "@/lib/types";
import { SourceChart } from "../ask/source-chart";
import { TypeIcon, typeLabel } from "../type-icon";

interface Detail {
  chunks: { id: string; chunk_kind: string; content: string }[];
  footnotes: { id: string; marker: string; text: string; page_number: number }[];
  referencedBy: { id: string; type: string; title: string | null; page_number: number }[];
}

/** One element: data, fidelity, footnote links both ways, derived chunks, ground-truth diff. */
export function ElementPanel({ element, groundTruth }: { element: StoredElement; groundTruth: GroundTruth }) {
  const [state, setState] = useState<{ id: string; detail: Detail | null; error: string | null } | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/elements/${element.id}`)
      .then(async (r) => {
        const payload = await r.json();
        if (!r.ok) throw new Error(payload.error ?? "Couldn't load the element.");
        if (!cancelled) setState({ id: element.id, detail: payload, error: null });
      })
      .catch((e: unknown) => !cancelled && setState({ id: element.id, detail: null, error: e instanceof Error ? e.message : "Couldn't load the element." }));
    return () => {
      cancelled = true;
    };
  }, [element.id]);
  const current = state?.id === element.id ? state : null;
  const fidelity = element.fidelity;

  return (
    <article className="surface space-y-4 p-4 sm:p-5">
      <header>
        <p className="flex items-center gap-1.5 text-[0.9375rem] font-medium">
          <TypeIcon type={element.type} className="size-4" />
          {typeLabel(element.type)}
          {element.title ? <span className="text-muted-foreground truncate font-normal">· {element.title}</span> : null}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Tag>{element.key}</Tag>
          {element.bbox ? <Tag>bbox [{element.bbox.join(", ")}]</Tag> : null}
          {fidelity?.checked === false ? (
            <Tag>fidelity not checked (labels not in text layer)</Tag>
          ) : fidelity?.flags?.length ? (
            <Tag tone="caution">⚠ {fidelity.flags.join("; ")}</Tag>
          ) : (
            <Tag tone="positive">fidelity ✓</Tag>
          )}
          {element.overridden ? <Tag tone="caution">manually overridden</Tag> : null}
        </div>
      </header>

      <ElementData element={element} />

      {current?.error ? <ErrorNote message={current.error} /> : null}
      {!current ? <SkeletonLines lines={3} /> : null}
      {current?.detail ? (
        <>
          {current.detail.footnotes.length ? (
            <section>
              <p className="eyebrow mb-1.5">Footnotes</p>
              <ul className="space-y-1 text-[0.8125rem]">
                {current.detail.footnotes.map((f) => (
                  <li key={f.id}>
                    <span className="font-medium">[{f.marker}]</span> {f.text} <span className="text-muted-foreground">(p. {f.page_number})</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {current.detail.referencedBy.length ? (
            <section>
              <p className="eyebrow mb-1.5">Referenced by</p>
              <ul className="space-y-1 text-[0.8125rem]">
                {current.detail.referencedBy.map((r) => (
                  <li key={r.id}>{r.title ?? r.type} · p. {r.page_number}</li>
                ))}
              </ul>
            </section>
          ) : null}
          <details>
            <summary className="text-muted-foreground hover:text-foreground cursor-pointer text-[0.8125rem]">Derived chunks ({current.detail.chunks.length})</summary>
            <ol className="mt-2 space-y-1.5">
              {current.detail.chunks.map((c) => (
                <li key={c.id} className="bg-surface-2 rounded-tight p-2 text-[0.75rem]">
                  <span className="font-medium">{c.chunk_kind}</span> — {c.content}
                </li>
              ))}
            </ol>
          </details>
        </>
      ) : null}

      <GroundTruthDiff element={element} groundTruth={groundTruth} />
    </article>
  );
}

function ElementData({ element }: { element: StoredElement }) {
  if (element.type === "table" && element.data) {
    const columns = (element.data.columns as string[]) ?? [];
    const rows = (element.data.rows as string[][]) ?? [];
    return (
      <div className="border-hairline max-h-72 overflow-auto rounded-tight border">
        <table className="w-full text-left text-[0.75rem]">
          <thead className="bg-surface-2"><tr>{columns.map((c, i) => <th key={i} className="px-2 py-1.5 font-medium">{c}</th>)}</tr></thead>
          <tbody>{rows.map((r, i) => <tr key={i} className="border-hairline border-t">{r.map((cell, j) => <td key={j} className="px-2 py-1">{cell}</td>)}</tr>)}</tbody>
        </table>
      </div>
    );
  }
  if (element.type === "chart" && element.data) {
    const series = (element.data.series as ChartSeries[]) ?? [];
    return (
      <div className="space-y-2">
        <SourceChart series={series} unit={element.data.unit as string | null} />
        <table className="w-full text-left text-[0.75rem]">
          <thead className="text-muted-foreground"><tr><th className="py-1 font-medium">Series · label</th><th className="py-1 font-medium">Value</th><th className="py-1 font-medium">Source</th></tr></thead>
          <tbody>
            {series.flatMap((s) => s.points.map((p, i) => (
              <tr key={`${s.name}-${i}`} className="border-hairline border-t">
                <td className="py-1">{series.length > 1 ? `${s.name} · ` : ""}{p.label}</td>
                <td className="py-1 tabular-nums">{p.valueText}</td>
                <td className="py-1">{p.valueSource === "labelled" ? "labelled" : <span className="text-caution">estimated</span>}</td>
              </tr>
            )))}
          </tbody>
        </table>
      </div>
    );
  }
  return <p className="excerpt max-h-60 overflow-y-auto">{element.markdown ?? element.text}</p>;
}

/** Compares a selected table/chart with the hand-labelled ground truth for its page. */
function GroundTruthDiff({ element, groundTruth }: { element: StoredElement; groundTruth: GroundTruth }) {
  if (element.type === "table") {
    const truth = groundTruth.tables.filter((t) => t.page === element.page).sort((a, b) => similarity(b.title ?? "", element.title ?? "") - similarity(a.title ?? "", element.title ?? ""))[0];
    if (!truth) return null;
    const rows = (element.data?.rows as string[][]) ?? [];
    const cells = truth.rows.flatMap((row) => {
      const got = rows.find((r) => norm(r[0] ?? "") === norm(row[0] ?? "")) ?? [];
      return row.map((value, i) => ({ row: row[0], column: truth.columns[i] ?? `col ${i + 1}`, expected: value, got: got[i] ?? "—", ok: norm(got[i] ?? "") === norm(value) }));
    });
    const wrong = cells.filter((c) => !c.ok).length;
    return <DiffList title={`Ground truth · ${truth.title ?? "table"}`} wrong={wrong} total={cells.length} items={cells.filter((c) => !c.ok).map((c) => ({ where: `${c.row} · ${c.column}`, expected: c.expected, got: c.got }))} />;
  }
  if (element.type === "chart") {
    const truth = groundTruth.charts.filter((t) => t.page === element.page).sort((a, b) => similarity(b.title ?? "", element.title ?? "") - similarity(a.title ?? "", element.title ?? ""))[0];
    if (!truth) return null;
    const points = ((element.data?.series as ChartSeries[]) ?? []).flatMap((s) => s.points);
    const items = truth.points.flatMap((p) => {
      const got = points.find((x) => norm(x.label) === norm(p.label));
      const ok = got?.valueSource === "labelled" && norm(got.valueText) === norm(p.valueText);
      return ok ? [] : [{ where: p.label, expected: p.valueText, got: got ? `${got.valueText} (${got.valueSource})` : "—" }];
    });
    return <DiffList title={`Ground truth · ${truth.title ?? "chart"}`} wrong={items.length} total={truth.points.length} items={items} />;
  }
  return null;
}

function DiffList({ title, wrong, total, items }: { title: string; wrong: number; total: number; items: { where: string; expected: string; got: string }[] }) {
  return (
    <section className="border-hairline border-t pt-3">
      <p className="eyebrow mb-1.5">{title}</p>
      <p className="text-[0.8125rem]">{wrong === 0 ? <span className="text-positive">All {total} values match ✓</span> : `${total - wrong} of ${total} match`}</p>
      {items.length ? (
        <ul className="mt-2 space-y-1 text-[0.75rem]">
          {items.slice(0, 20).map((d, i) => (
            <li key={i}><span className="font-medium">{d.where}:</span> expected <code>{d.expected}</code>, got <code>{d.got}</code></li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
