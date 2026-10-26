import type { TargetType } from "../types";
import type { ExpandedElement } from "./expand";

/**
 * Keep the final elements from being all one type when the question
 * plausibly needs another (06 §5): if the top N share one type and the
 * analysis listed a missing target type, the weakest is swapped for the best
 * element of that type — if it scores within 50% of the cut-off.
 */
function typeOf(item: ExpandedElement): string {
  return item.element?.type ?? "flat";
}

export function diversify(ranked: ExpandedElement[], limit: number, targetTypes: TargetType[]): { chosen: ExpandedElement[]; swapped: string | null } {
  const chosen = ranked.slice(0, limit);
  if (chosen.length < limit || targetTypes.length === 0) return { chosen, swapped: null };
  const present = new Set(chosen.map(typeOf));
  if (present.size > 1) return { chosen, swapped: null };

  const cutoff = chosen.at(-1)!.score;
  const missing = targetTypes.filter((t) => !present.has(t));
  const replacement = ranked.slice(limit).find((item) => missing.includes(typeOf(item) as TargetType) && item.score >= cutoff * 0.5);
  if (!replacement) return { chosen, swapped: null };
  return { chosen: [...chosen.slice(0, -1), replacement].sort((a, b) => b.score - a.score), swapped: typeOf(replacement) };
}
