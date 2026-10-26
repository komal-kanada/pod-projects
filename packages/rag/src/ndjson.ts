/**
 * Newline-delimited JSON streaming: the server sends one JSON object per
 * line, so sources can reach the screen before the answer text exists.
 *
 * `ndjsonResponse` is used by route handlers; `readNdjson` by the browser.
 * Neither touches Node-only APIs, so this module is safe on both sides.
 */

export function ndjsonResponse<T>(
  events: AsyncIterable<T>,
  { onError }: { onError?: (error: unknown) => T } = {},
): Response {
  const encoder = new TextEncoder();
  const iterator = events[Symbol.asyncIterator]();

  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await iterator.next();
        if (done) {
          controller.close();
          return;
        }
        controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`));
      } catch (error) {
        if (onError) {
          controller.enqueue(encoder.encode(`${JSON.stringify(onError(error))}\n`));
        }
        controller.close();
      }
    },
    async cancel() {
      await iterator.return?.();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
      "x-accel-buffering": "no",
    },
  });
}

export async function* readNdjson<T>(response: Response): AsyncGenerator<T> {
  if (!response.body) return;

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    let newline = buffer.indexOf("\n");
    while (newline !== -1) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) yield JSON.parse(line) as T;
      newline = buffer.indexOf("\n");
    }
  }

  const rest = buffer.trim();
  if (rest) yield JSON.parse(rest) as T;
}
