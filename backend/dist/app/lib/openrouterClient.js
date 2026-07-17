"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.openrouter = void 0;
const openai_1 = __importDefault(require("openai"));
const config_1 = __importDefault(require("../config"));
/**
 * OpenRouter is OpenAI-API-compatible, so the official `openai` SDK talks to
 * it directly via `baseURL` — this gives typed chat/embeddings calls, and
 * swapping models or adding new OpenRouter-backed features later is just a
 * model string change, not a new HTTP client.
 */
exports.openrouter = new openai_1.default({
    apiKey: config_1.default.openrouter_api_key,
    baseURL: 'https://openrouter.ai/api/v1',
    // The SDK default (10 min, 2 retries) lets a slow/rate-limited free-tier model hang a
    // request for a very long time with nothing logged — fail fast instead.
    timeout: 20000,
    maxRetries: 1,
    defaultHeaders: {
        'HTTP-Referer': config_1.default.web_url,
        'X-Title': 'Growth Studio',
    },
});
