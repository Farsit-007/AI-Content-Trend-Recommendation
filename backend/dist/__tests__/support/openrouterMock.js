"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLastChatCompletionRequest = exports.getOpenRouterCallCounts = exports.mockEmbedding = exports.mockChatCompletion = void 0;
const openrouterClient_1 = require("../../app/lib/openrouterClient");
// The real `openrouter` export is a typed `OpenAI` SDK instance; at runtime, once a test file
// calls `jest.mock('.../openrouterClient')`, this import resolves to the manual mock in
// `app/lib/__mocks__/openrouterClient.ts` instead. The cast bridges the two shapes for TS.
const mocked = openrouterClient_1.openrouter;
/** Configures the mocked chat-completion call to resolve with the given assistant message content. */
const mockChatCompletion = (content) => {
    mocked.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content } }],
    });
};
exports.mockChatCompletion = mockChatCompletion;
/** Configures the mocked embeddings call to resolve with a fixed 1536-dimension vector. */
const mockEmbedding = (vector = Array(1536).fill(0.01)) => {
    mocked.embeddings.create.mockResolvedValue({
        data: [{ embedding: vector }],
    });
};
exports.mockEmbedding = mockEmbedding;
const getOpenRouterCallCounts = () => ({
    chatCompletionCalls: mocked.chat.completions.create.mock.calls.length,
    embeddingCalls: mocked.embeddings.create.mock.calls.length,
});
exports.getOpenRouterCallCounts = getOpenRouterCallCounts;
/** Returns the request body of the most recent mocked chat-completion call (for prompt assertions). */
const getLastChatCompletionRequest = () => {
    const calls = mocked.chat.completions.create.mock.calls;
    if (calls.length === 0)
        throw new Error('No chat-completion calls were made');
    return calls[calls.length - 1][0];
};
exports.getLastChatCompletionRequest = getLastChatCompletionRequest;
