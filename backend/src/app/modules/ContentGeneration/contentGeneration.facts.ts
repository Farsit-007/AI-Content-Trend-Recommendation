import config from '../../config';
import { LLM_MODELS, chatCompletion } from '../../lib/llmClient';
import { logger } from '../../lib/logger';
import { redis } from '../../lib/redis';

export interface FactSheet {
  summary: string;
  facts: string[];
}

const FACTS_CACHE_TTL_SECONDS = 604800; // 7 days — facts are item-scoped, not team/language/format-scoped.

export const FACT_EXTRACTION_SYSTEM_PROMPT =
  'You extract a compact, verifiable fact sheet from a news article for a content-writing team to reference. ' +
  'Respond with ONLY a strict JSON object, no markdown fences, no commentary. It must have exactly these keys: ' +
  '{ "summary": "<at most 3 sentences>", "facts": ["<at most 200 characters>", ... 5 to 10 items] }. ' +
  'Write in neutral English regardless of the source language — this is reference data, not copy. ' +
  'Only include facts explicitly stated in the article; do not infer, estimate, or add outside knowledge.';

const isValidFactSheet = (v: unknown): v is FactSheet => {
  if (typeof v !== 'object' || v === null) return false;
  const candidate = v as Record<string, unknown>;
  return (
    typeof candidate.summary === 'string' &&
    candidate.summary.trim().length > 0 &&
    Array.isArray(candidate.facts) &&
    candidate.facts.length >= 5 &&
    candidate.facts.length <= 10 &&
    candidate.facts.every((fact) => typeof fact === 'string' && fact.trim().length > 0 && fact.length <= 200)
  );
};

const parseFactSheet = (raw: string): FactSheet | null => {
  const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*$/g, '').trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return null;
  }
  return isValidFactSheet(parsed) ? parsed : null;
};

/** One cheap extraction call. Soft-fails to null on any LLM or parse/shape error — never throws. */
export const extractFactSheet = async (title: string, content: string): Promise<FactSheet | null> => {
  const cappedContent = content.slice(0, config.content_generation.facts_input_max_chars);

  let raw: string;
  try {
    raw = await chatCompletion({
      model: LLM_MODELS.standard,
      temperature: 0.2,
      messages: [
        { role: 'system', content: FACT_EXTRACTION_SYSTEM_PROMPT },
        { role: 'user', content: `Title: ${title}\n\nArticle:\n${cappedContent}` },
      ],
    });
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : err }, '[ContentGeneration] Fact extraction LLM call failed');
    return null;
  }

  const factSheet = parseFactSheet(raw);
  if (!factSheet) {
    logger.warn('[ContentGeneration] Fact extraction response was not valid structured JSON');
  }
  return factSheet;
};

const factsCacheKey = (newsItemId: string): string => `facts:${newsItemId}`;

/**
 * Redis-shared wrapper: one extraction per news item serves every team, format, and request
 * generating from it for 7 days. A failed extraction caches nothing, so a later request can retry.
 */
export const getOrExtractFactSheet = async (
  newsItemId: string,
  title: string,
  content: string,
): Promise<FactSheet | null> => {
  const key = factsCacheKey(newsItemId);
  const cached = await redis.get(key);
  if (cached) {
    return JSON.parse(cached) as FactSheet;
  }

  const factSheet = await extractFactSheet(title, content);
  if (factSheet) {
    await redis.setex(key, FACTS_CACHE_TTL_SECONDS, JSON.stringify(factSheet));
  }
  return factSheet;
};
