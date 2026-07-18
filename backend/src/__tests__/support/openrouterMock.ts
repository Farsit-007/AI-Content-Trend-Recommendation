import { openrouter } from '../../app/lib/openrouterClient';

// The real `openrouter` export is a typed `OpenAI` SDK instance; at runtime, once a test file
// calls `jest.mock('.../openrouterClient')`, this import resolves to the manual mock in
// `app/lib/__mocks__/openrouterClient.ts` instead. The cast bridges the two shapes for TS.
const mocked = openrouter as unknown as {
  chat: { completions: { create: jest.Mock } };
  embeddings: { create: jest.Mock };
};

/** Configures the mocked chat-completion call to resolve with the given assistant message content. */
export const mockChatCompletion = (content: string): void => {
  mocked.chat.completions.create.mockResolvedValue({
    choices: [{ message: { content } }],
  });
};

/**
 * Configures the mocked chat-completion call to resolve with a different response on each
 * successive call (chained `mockResolvedValueOnce`, consumed in call order), for asserting
 * per-format prompts/results on requests that trigger multiple concurrent LLM calls.
 */
export const mockChatCompletionSequence = (responses: string[]): void => {
  for (const content of responses) {
    mocked.chat.completions.create.mockResolvedValueOnce({
      choices: [{ message: { content } }],
    });
  }
};

/**
 * Configures the mocked chat-completion call to respond based on which substring appears in the
 * prompt, rather than call order. Required whenever a test needs specific response content mapped
 * to a specific format/prompt in a request that generates multiple formats concurrently — each
 * format's `chatCompletionForTask` call now does an async DB read (model resolution) before the
 * HTTP call, so the physical order in which concurrent calls reach `create()` is not guaranteed to
 * match the formats' request/array order the way a purely-synchronous-until-the-HTTP-call chain
 * once did.
 */
export const mockChatCompletionByPrompt = (rules: { match: string; response: string }[]): void => {
  mocked.chat.completions.create.mockImplementation(async (req: { messages: { content: string }[] }) => {
    const prompt = req.messages[0]?.content ?? '';
    const rule = rules.find((r) => prompt.includes(r.match));
    if (!rule) {
      throw new Error(`mockChatCompletionByPrompt: no rule matched prompt: ${prompt.slice(0, 200)}`);
    }
    return { choices: [{ message: { content: rule.response } }] };
  });
};

/**
 * Queues a single rejected chat-completion call, for the *next* call only (chains after
 * `mockChatCompletionSequence`/`mockChatCompletion`, consumed in call order). Explicit rejection
 * rather than relying on an "exhausted mock" default — `clearMocks` only clears call history
 * between tests, not a previous test's persistent `mockResolvedValue`, so an unconfigured call
 * can silently fall through to an earlier test's leftover implementation instead of failing.
 */
export const mockChatCompletionFailureOnce = (message = 'simulated LLM failure'): void => {
  mocked.chat.completions.create.mockRejectedValueOnce(new Error(message));
};

/** Configures the mocked embeddings call to resolve with a fixed 1536-dimension vector. */
export const mockEmbedding = (vector: number[] = Array(1536).fill(0.01)): void => {
  mocked.embeddings.create.mockResolvedValue({
    data: [{ embedding: vector }],
  });
};

/**
 * Configures the mocked embeddings call to resolve with one 1536-dimension vector per input item,
 * regardless of how many items are sent — required for `embedBatch` callers (a single-vector
 * `mockEmbedding` response fails `embedBatch`'s length-match validation for batches of size > 1).
 */
export const mockEmbeddingBatch = (vector: number[] = Array(1536).fill(0.01)): void => {
  mocked.embeddings.create.mockImplementation(async (req: { input: string | string[] }) => {
    const count = Array.isArray(req.input) ? req.input.length : 1;
    return { data: Array.from({ length: count }, () => ({ embedding: vector })) };
  });
};

export const getOpenRouterCallCounts = () => ({
  chatCompletionCalls: mocked.chat.completions.create.mock.calls.length,
  embeddingCalls: mocked.embeddings.create.mock.calls.length,
});

/** Returns the request body of the most recent mocked chat-completion call (for prompt assertions). */
export const getLastChatCompletionRequest = (): {
  messages: { role: string; content: string }[];
} => {
  const calls = mocked.chat.completions.create.mock.calls;
  if (calls.length === 0) throw new Error('No chat-completion calls were made');
  return calls[calls.length - 1][0];
};

/** Returns every mocked chat-completion call's request body, in call order — for per-format prompt assertions. */
export const getChatCompletionRequests = (): { messages: { role: string; content: string }[] }[] =>
  mocked.chat.completions.create.mock.calls.map((call) => call[0]);
