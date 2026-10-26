import sharp from "sharp";
import type { BBox } from "../types";

/**
 * A padded crop of a page image for a normalised box. Used for the focused
 * extraction pass (X2), the images sent to the answer model (M4), and the
 * original-crop view in source cards and the Explorer.
 */
export async function cropPng(
  png: Uint8Array | string,
  box: BBox,
  { padding = 0.04, maxWidth }: { padding?: number; maxWidth?: number } = {},
): Promise<Buffer> {
  const image = sharp(png);
  const { width = 0, height = 0 } = await image.metadata();
  const pad = padding * 1000;
  const ymin = Math.max(0, box[0] - pad);
  const xmin = Math.max(0, box[1] - pad);
  const ymax = Math.min(1000, box[2] + pad);
  const xmax = Math.min(1000, box[3] + pad);
  const left = Math.floor((xmin / 1000) * width);
  const top = Math.floor((ymin / 1000) * height);
  const cropWidth = Math.max(1, Math.min(width - left, Math.ceil(((xmax - xmin) / 1000) * width)));
  const cropHeight = Math.max(1, Math.min(height - top, Math.ceil(((ymax - ymin) / 1000) * height)));

  let pipeline = image.extract({ left, top, width: cropWidth, height: cropHeight });
  if (maxWidth && cropWidth > maxWidth) pipeline = pipeline.resize({ width: maxWidth });
  return pipeline.png({ compressionLevel: 9 }).toBuffer();
}
