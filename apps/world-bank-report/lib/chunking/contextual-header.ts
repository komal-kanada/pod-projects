import { DOCUMENT } from "../config";
import { REGIONS } from "../metadata/vocab";
import { PATH_SEPARATOR } from "../types";

/**
 * The breadcrumb prefix embedded with every unit (05 §3). A paragraph that
 * only says "growth is projected to slow" is embedded as being about South
 * Asia's outlook — the cheapest high-impact fix for chunks that lost their
 * context.
 */
export function contextualHeader({
  path,
  regions = [],
  years = [],
  type,
  pageStart,
  pageEnd,
}: {
  path: string[];
  regions?: string[];
  years?: number[];
  type?: string;
  pageStart: string;
  pageEnd: string;
}): string {
  const crumb = [DOCUMENT.title, ...path].join(PATH_SEPARATOR);
  const tags = [
    regions.length ? `[Region: ${regions.map((code) => REGIONS[code]?.name ?? code).join(", ")}]` : "",
    years.length ? `[Years: ${years.slice(0, 6).join(", ")}${years.length > 6 ? ", …" : ""}]` : "",
    type ? `[Type: ${type}]` : "",
    `[Pages: ${pageStart === pageEnd ? pageStart : `${pageStart}–${pageEnd}`}]`,
  ].filter(Boolean);
  return `${crumb}\n${tags.join(" ")}`;
}
