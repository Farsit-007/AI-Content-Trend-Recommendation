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
