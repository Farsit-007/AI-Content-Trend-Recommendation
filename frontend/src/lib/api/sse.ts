import { getToken } from './tokenStore';
import { ApiError } from './types';

/**
 * Server-Sent Events client built on `fetch`, not the browser's `EventSource`.
 *
 * `EventSource` cannot send an `Authorization` header and cannot issue a POST — both of which every
 * streaming endpoint here needs. Reading the body stream from a `fetch` response gives us headers,
 * a request body, and `AbortSignal` cancellation, at the cost of parsing the wire format ourselves.
 * That format is small: events are `\n\n`-separated blocks of `field: value` lines.
 */

export interface SseHandlers {
  /** Called per event. `event` is the server's `event:` name; `data` is its parsed JSON payload. */
  onEvent: (event: string, data: unknown) => void;
  signal?: AbortSignal;
}

const baseURL = import.meta.env.VITE_API_URL;

/** Splits an SSE block into its event name and raw data, ignoring comment lines (`: keep-alive`). */
const parseBlock = (block: string): { event: string; data: string } | null => {
  let event = 'message';
  const dataLines: string[] = [];

  for (const line of block.split('\n')) {
    if (line.startsWith(':')) continue;
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
  }

  return dataLines.length > 0 ? { event, data: dataLines.join('\n') } : null;
};

export async function streamSse(path: string, body: unknown, handlers: SseHandlers): Promise<void> {
  const token = getToken();

  const response = await fetch(`${baseURL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    credentials: 'include',
    body: JSON.stringify(body),
    signal: handlers.signal,
  });

  // A failure *before* the stream opens still arrives as an ordinary JSON error response with a real
  // status code — normalize it into the same ApiError the rest of the client throws, so callers
  // don't need a separate error path for streaming.
  if (!response.ok || !response.body) {
    let message = `Request failed (${response.status})`;
    try {
      const parsed = (await response.json()) as { message?: string };
      if (parsed?.message) message = parsed.message;
    } catch {
      // Non-JSON body — the status-derived message stands.
    }
    throw new ApiError(message, response.status, []);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Everything up to the last `\n\n` is a complete block; the remainder is a partial event that
      // has to stay buffered until the rest of it arrives.
      const blocks = buffer.split('\n\n');
      buffer = blocks.pop() ?? '';

      for (const block of blocks) {
        const parsed = parseBlock(block);
        if (!parsed) continue;
        try {
          handlers.onEvent(parsed.event, JSON.parse(parsed.data));
        } catch {
          // A malformed payload is not worth tearing the stream down for.
        }
      }
    }
  } finally {
    // Releasing the lock lets the connection close promptly when the caller aborts mid-stream —
    // which on these endpoints is what stops the server making further paid LLM calls.
    reader.releaseLock();
  }
}
