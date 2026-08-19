import { afterEach, describe, expect, it, vi } from 'vitest';
import { streamSse } from './sse';
import { ApiError } from './types';

vi.mock('./tokenStore', () => ({ getToken: () => 'test-token' }));

/**
 * The SSE parser is the riskiest piece of the streaming client: it reassembles events from arbitrary
 * network chunk boundaries, and getting that wrong shows up as dropped or merged tokens rather than
 * as an error. These drive it with deliberately awkward chunking.
 */

const encoder = new TextEncoder();

/** A fetch Response whose body streams `chunks` in exactly the pieces given. */
const streamingResponse = (chunks: string[]): Response => {
  let i = 0;
  return {
    ok: true,
    status: 200,
    body: {
      getReader: () => ({
        read: async () =>
          i < chunks.length ? { done: false, value: encoder.encode(chunks[i++]) } : { done: true, value: undefined },
        releaseLock: () => undefined,
      }),
    },
  } as unknown as Response;
};

const collect = async (chunks: string[]) => {
  const events: { event: string; data: unknown }[] = [];
  vi.stubGlobal('fetch', vi.fn(async () => streamingResponse(chunks)));
  await streamSse('/chat/stream', {}, { onEvent: (event, data) => events.push({ event, data }) });
  return events;
};

afterEach(() => vi.unstubAllGlobals());

describe('streamSse', () => {
  it('parses discrete events', async () => {
    const events = await collect([
      'event: start\ndata: {"conversation_id":"c1"}\n\n',
      'event: delta\ndata: {"text":"Hello"}\n\n',
      'event: done\ndata: {"reply":"Hello"}\n\n',
    ]);

    expect(events).toEqual([
      { event: 'start', data: { conversation_id: 'c1' } },
      { event: 'delta', data: { text: 'Hello' } },
      { event: 'done', data: { reply: 'Hello' } },
    ]);
  });

  it('reassembles an event split across chunk boundaries', async () => {
    // The realistic case: TCP does not respect message boundaries, so an event can arrive in pieces.
    const events = await collect(['event: del', 'ta\ndata: {"te', 'xt":"Hi"}\n', '\n']);

    expect(events).toEqual([{ event: 'delta', data: { text: 'Hi' } }]);
  });

  it('handles several events arriving in one chunk', async () => {
    const events = await collect(['event: delta\ndata: {"text":"a"}\n\nevent: delta\ndata: {"text":"b"}\n\n']);

    expect(events.map((e) => (e.data as { text: string }).text)).toEqual(['a', 'b']);
  });

  it('ignores heartbeat comments', async () => {
    // The server sends these every 15s to stop proxies idling the connection out. They are not events.
    const events = await collect([': keep-alive\n\n', 'event: delta\ndata: {"text":"x"}\n\n']);

    expect(events).toHaveLength(1);
  });

  it('does not emit a trailing partial event', async () => {
    // A stream cut mid-event must drop the fragment, not surface half a payload.
    const events = await collect(['event: delta\ndata: {"text":"complete"}\n\nevent: delta\ndata: {"text":"trunc']);

    expect(events).toHaveLength(1);
    expect((events[0].data as { text: string }).text).toBe('complete');
  });

  it('survives a malformed payload without tearing down the stream', async () => {
    const events = await collect([
      'event: delta\ndata: {not json}\n\n',
      'event: delta\ndata: {"text":"after"}\n\n',
    ]);

    expect(events).toEqual([{ event: 'delta', data: { text: 'after' } }]);
  });

  it('throws a normalized ApiError when the request fails before the stream opens', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 429,
        json: async () => ({ message: 'This team has reached its daily AI generation limit.' }),
      })),
    );

    await expect(streamSse('/chat/stream', {}, { onEvent: () => undefined })).rejects.toThrow(ApiError);
    await expect(streamSse('/chat/stream', {}, { onEvent: () => undefined })).rejects.toThrow(/daily AI generation/);
  });

  it('sends the bearer token and asks for an event stream', async () => {
    const fetchMock = vi.fn(async () => streamingResponse([]));
    vi.stubGlobal('fetch', fetchMock);

    await streamSse('/chat/stream', { team_id: 't1' }, { onEvent: () => undefined });

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer test-token');
    expect(headers.Accept).toBe('text/event-stream');
    expect(init.body).toBe(JSON.stringify({ team_id: 't1' }));
  });
});
