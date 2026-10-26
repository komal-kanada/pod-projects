import type { Gemini } from "@pod/ai";
import type { Element, RenderedPage } from "../../types";

/**
 * One interface for every strategy (02 §Rules), so they are swappable and
 * scored on the same ground truth.
 */
export interface StrategyContext {
  gemini: Gemini | null;
  /** The PDF bytes, for strategies that re-render regions. */
  data: Uint8Array;
  /** All pages — X0 needs them to spot running headers. */
  pages: RenderedPage[];
  model: string;
  onUsage?: (tokens: number) => void;
}

export interface Strategy {
  id: string;
  /** Changes whenever the strategy's output would change (prompt, model…). */
  version(ctx: StrategyContext): string;
  extractPage(page: RenderedPage, ctx: StrategyContext): Promise<Element[]>;
}
