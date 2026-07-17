"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.openrouter = void 0;
// Manual mock for `../openrouterClient`. Picked up automatically by Jest once a test file
// calls `jest.mock('.../openrouterClient')` — see support/openrouterMock.ts for the typed
// helpers tests use to configure these mock functions.
exports.openrouter = {
    chat: {
        completions: {
            create: jest.fn(),
        },
    },
    embeddings: {
        create: jest.fn(),
    },
};
