"use client";

import { useCallback, useRef, useState } from "react";

/** A non-2xx reply, keeping the server's `code` (e.g. "quota") for the UI. */
export class RequestError extends Error {
  constructor(
    message: string,
    readonly code: string | null,
  ) {
    super(message);
    this.name = "RequestError";
  }
}

/**
 * Posts JSON and consumes the NDJSON reply event by event. Owns the
 * AbortController so a new question cancels the previous one, and Stop works.
 */
export function useNdjsonStream<E>() {
  const [running, setRunning] = useState(false);
  const controller = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
    setRunning(false);
  }, []);

  const run = useCallback(
    async (url: string, body: unknown, onEvent: (event: E) => void): Promise<void> => {
      controller.current?.abort();
      const current = new AbortController();
      controller.current = current;
      setRunning(true);

      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
          signal: current.signal,
        });

        if (!response.ok || !response.body) {
          const payload = (await response.json().catch(() => null)) as { error?: string; code?: string } | null;
          throw new RequestError(payload?.error ?? `The server answered ${response.status}.`, payload?.code ?? null);
        }

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
            if (line) onEvent(JSON.parse(line) as E);
            newline = buffer.indexOf("\n");
          }
        }
        const rest = buffer.trim();
        if (rest) onEvent(JSON.parse(rest) as E);
      } catch (error) {
        if (current.signal.aborted) return;
        throw error instanceof TypeError
          ? new Error("Couldn't reach the server. Check your connection and try again.")
          : error;
      } finally {
        if (controller.current === current) {
          controller.current = null;
          setRunning(false);
        }
      }
    },
    [],
  );

  return { run, cancel, running };
}
