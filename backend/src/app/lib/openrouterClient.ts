import OpenAI from 'openai';
import config from '../config';

/**
 * OpenRouter is OpenAI-API-compatible, so the official `openai` SDK talks to
 * it directly via `baseURL` — this gives typed chat/embeddings calls, and
 * swapping models or adding new OpenRouter-backed features later is just a
 * model string change, not a new HTTP client.
 */
export const openrouter = new OpenAI({
  apiKey: config.openrouter_api_key,
  baseURL: 'https://openrouter.ai/api/v1',
  // The SDK default (10 min, 2 retries) lets a slow/rate-limited free-tier model hang a
  // request for a very long time with nothing logged — fail fast instead.
  timeout: 20_000,
  maxRetries: 1,
  defaultHeaders: {
    'HTTP-Referer': config.web_url as string,
    'X-Title': 'Growth Studio',
  },
});
