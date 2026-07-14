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
