import { Response } from 'express';
import { openSseChannel, sendSseError } from '../app/lib/sse';

/**
 * The SSE wire format is small but unforgiving — a missing blank line or a stray newline inside a
 * payload silently merges two events on the client. These assert the bytes, not just the calls.
 */

interface FakeRes {
  writeHead: jest.Mock;
  write: jest.Mock;
  end: jest.Mock;
  flushHeaders: jest.Mock;
  on: jest.Mock;
  /** Everything written, concatenated — the actual stream a client would read. */
  body: () => string;
  /** Invokes the registered 'close' listener, simulating the client going away. */
  triggerClose: () => void;
}

const fakeRes = (): FakeRes => {
  const writes: string[] = [];
  const listeners: Record<string, () => void> = {};
  const res = {
    writeHead: jest.fn(),
    write: jest.fn((chunk: string) => {
      writes.push(chunk);
      return true;
    }),
    end: jest.fn(),
    flushHeaders: jest.fn(),
    // Returns void rather than `res`: the real Response returns itself for chaining, but typing
    // that here makes the object recursively self-referential and TS can't infer it. Nothing under
    // test chains off `.on()`.
    on: jest.fn((event: string, cb: () => void) => {
      listeners[event] = cb;
    }),
    body: () => writes.join(''),
    triggerClose: () => listeners.close?.(),
  };
  return res as unknown as FakeRes;
};

describe('openSseChannel', () => {
  it('sets the headers streaming actually requires', () => {
    const res = fakeRes();
    openSseChannel(res as unknown as Response);

    const [status, headers] = res.writeHead.mock.calls[0];
    expect(status).toBe(200);
    expect(headers['Content-Type']).toBe('text/event-stream');
    expect(headers['Cache-Control']).toContain('no-cache');
    // Without this, nginx and several PaaS proxies buffer the whole response and deliver it at the
    // end — which is exactly the behaviour streaming exists to replace, failing silently.
    expect(headers['X-Accel-Buffering']).toBe('no');
    expect(res.flushHeaders).toHaveBeenCalled();
  });

  it('serializes an event in the SSE wire format, terminated by a blank line', () => {
    const res = fakeRes();
    const channel = openSseChannel(res as unknown as Response);

    channel.send('delta', { text: 'hello' });

    expect(res.body()).toBe('event: delta\ndata: {"text":"hello"}\n\n');
  });

  it('JSON-escapes newlines so multi-line text cannot split one event into two', () => {
    const res = fakeRes();
    const channel = openSseChannel(res as unknown as Response);

    channel.send('delta', { text: 'line one\nline two' });

    // The literal newline must survive as \n inside the JSON, not as a real line break.
    expect(res.body()).toBe('event: delta\ndata: {"text":"line one\\nline two"}\n\n');
    expect(res.body().split('\n\n').filter(Boolean)).toHaveLength(1);
  });

  it('stops writing once closed, and close is idempotent', () => {
    const res = fakeRes();
    const channel = openSseChannel(res as unknown as Response);

    channel.close();
    channel.close();
    channel.send('delta', { text: 'should not appear' });

    expect(res.end).toHaveBeenCalledTimes(1);
    expect(res.body()).toBe('');
  });

  it('reports a client disconnect so callers can stop doing paid work', () => {
    const res = fakeRes();
    const channel = openSseChannel(res as unknown as Response);

    expect(channel.isClosed()).toBe(false);
    res.triggerClose();

    expect(channel.isClosed()).toBe(true);
    channel.send('delta', { text: 'nobody is listening' });
    expect(res.body()).toBe('');
  });
});

describe('sendSseError', () => {
  it('emits a terminal error event and closes', () => {
    const res = fakeRes();
    const channel = openSseChannel(res as unknown as Response);

    sendSseError(channel, 'Chat request failed');

    // Headers are already sent by this point, so the status code is fixed at 200 — the event stream
    // is the only channel left to report a failure on.
    expect(res.body()).toBe('event: error\ndata: {"message":"Chat request failed"}\n\n');
    expect(channel.isClosed()).toBe(true);
  });
});
