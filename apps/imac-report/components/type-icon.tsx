import { BarChart3, FileText, Heading, Image as ImageIcon, Megaphone, Superscript, Table2 } from "lucide-react";
import type { ElementType } from "@/lib/types";

const ICONS = { table: Table2, chart: BarChart3, footnote: Superscript, callout: Megaphone, text: FileText, heading: Heading, image: ImageIcon, flat: FileText } as const;
const LABELS = { table: "Table", chart: "Chart", footnote: "Footnote", callout: "Callout", text: "Text", heading: "Heading", image: "Image", flat: "Page text" } as const;

/** Type is always icon + word, never colour alone. */
export function TypeIcon({ type, className = "size-3.5" }: { type: ElementType | "flat"; className?: string }) {
  const Icon = ICONS[type];
  return <Icon className={className} aria-hidden />;
}

export function typeLabel(type: ElementType | "flat"): string {
  return LABELS[type];
}

/** Box colours for the Explorer overlay, from the chart tokens. */
export const TYPE_COLOURS: Record<ElementType, string> = {
  heading: "var(--chart-5)",
  text: "var(--chart-5)",
  table: "var(--chart-4)",
  chart: "var(--chart-2)",
  footnote: "var(--chart-1)",
  callout: "var(--chart-3)",
  image: "var(--chart-5)",
};
