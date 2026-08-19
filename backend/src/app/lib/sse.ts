import { Response } from 'express';
import { logger } from './logger';

/**
 * Minimal Server-Sent Events transport.
 *
 * SSE rather than WebSockets: the traffic is one-directional (server → client) and short-lived, it
 * rides ordinary HTTP so the existing CORS, auth and rate-limit middleware apply unchanged, and the
 * browser reconnects on its own. A WebSocket would need its own auth handshake and its own path
 * through the proxy for no benefit here.
 */

/** Interval between heartbeat comments. Proxies commonly idle out a silent connection near 60s. */
const HEARTBEAT_MS = 15_000;

export interface SseChannel {
  /** Sends a named event with a JSON payload. No-op once the client has gone. */
  send: (event: string, data: unknown) => void;
  /** Ends the stream and stops the heartbeat. Safe to call more than once. */
  close: () => void;
  /** True once the client disconnected — check it inside long loops to stop doing paid work. */
  isClosed: () => boolean;
}

export const openSseChannel = (res: Response): SseChannel => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    // Nginx and several PaaS proxies buffer responses by default, which defeats streaming entirely
    // — the client would receive everything at once at the end, exactly what this replaces.
    'X-Accel-Buffering': 'no',
  });
  // Flush headers immediately so the browser's EventSource/fetch reader opens before the first token.
  res.flushHeaders?.();

  let closed = false;

  const heartbeat = setInterval(() => {
    if (closed) return;
    // A comment line: valid SSE, ignored by clients, enough to keep intermediaries from idling out.
    res.write(': keep-alive\n\n');
  }, HEARTBEAT_MS);
  heartbeat.unref();

  const close = () => {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    res.end();
  };

  // The client navigating away or hitting stop must stop server-side work, not just be ignored —
  // on the generation route each remaining format is a paid LLM call.
  res.on('close', () => {
    if (!closed) {
      closed = true;
      clearInterval(heartbeat);
      logger.info('[sse] client disconnected');
    }
  });

  return {
    send: (event, data) => {
      if (closed) return;
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    },
    close,
    isClosed: () => closed,
  };
};

/**
 * Reports a failure over an already-open stream.
 *
 * Once headers are sent the status code is fixed at 200, so an error cannot be signalled the usual
 * way — the client has to learn about it from the event stream. Emitting a terminal `error` event is
 * what lets the frontend tell "the answer finished" from "the answer stopped".
 */
export const sendSseError = (channel: SseChannel, message: string): void => {
  channel.send('error', { message });
  channel.close();
};
