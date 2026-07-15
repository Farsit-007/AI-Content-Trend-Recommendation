import { LLM_MODELS, chatCompletion } from '../../lib/llmClient';
import { logger } from '../../lib/logger';
import { CategorizedNewsItem, NEWS_CATEGORIES, NewsCategory, ScoredNewsItem } from './newsIngestion.interface';

const BATCH_SIZE = 10;

interface LlmCategorization {
  id: number;
  category: string;
  impact_note: string;
  confidence: number;
  audience_fit: number;
}

const isValidCategory = (category: string): category is NewsCategory =>
  (NEWS_CATEGORIES as readonly string[]).includes(category);

const isUnitInterval = (n: unknown): n is number => typeof n === 'number' && n >= 0 && n <= 1;

// Cold, low-confidence fallback so a parse/validation failure never masquerades as a real
// AI judgment — this drives `needs_review: true` and a fit derived from relevance alone.
const fallbackCategorize = (item: ScoredNewsItem): CategorizedNewsItem => ({
  ...item,
  category: 'Other',
  impact_note: 'Automatically ingested — category/opportunity scoring unavailable for this item.',
  category_confidence: 0,
  audience_fit: (item.relevance_score ?? 0) / 10,
});

const parseLlmResponse = (raw: string): LlmCategorization[] | null => {
  const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*$/g, '').trim();
  try {
    const parsed = JSON.parse(cleaned);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const categorizeOneBatch = async (batch: ScoredNewsItem[]): Promise<CategorizedNewsItem[]> => {
  const prompt = batch
    .map(
      (item, id) =>
        `${id}. "${item.title}" — ${item.snippet ?? 'no snippet'} (relevance_score=${item.relevance_score ?? 'n/a'}, trend_score=${item.trend_score})`,
    )
    .join('\n');

  let raw: string;
  try {
    raw = await chatCompletion({
      model: LLM_MODELS.standard,
      temperature: 0.3,
      messages: [
        {
          role: 'system',
          content:
            'You categorize tech news items for a social media growth team. Respond with ONLY a strict JSON array, ' +
            'no markdown fences, no commentary. Each element must be: ' +
            '{ "id": <number>, "category": one of "AI"|"Web Dev"|"Career"|"Security"|"DevOps"|"Other", ' +
            '"impact_note": "<one sentence on audience fit>", "confidence": <number 0-1, how sure you are of the category>, ' +
            '"audience_fit": <number 0-1, how well this topic fits a growth/social content team\'s audience, ' +
            'independent of how trendy or on-brand it already scored> }. ' +
            'Include exactly one element per input item, using the same id.',
        },
        { role: 'user', content: prompt },
      ],
    });
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : err }, '[NewsIngestion] Categorization LLM call failed');
    return batch.map(fallbackCategorize);
  }

  const parsed = parseLlmResponse(raw);
  if (!parsed) {
    logger.error('[NewsIngestion] Categorization response was not valid JSON, falling back for entire batch');
    return batch.map(fallbackCategorize);
  }

  const byId = new Map(parsed.map((entry) => [entry.id, entry]));

  return batch.map((item, id) => {
    const result = byId.get(id);
    if (!result || !isValidCategory(result.category)) {
      return fallbackCategorize(item);
    }
    const fallback = fallbackCategorize(item);
    return {
      ...item,
      category: result.category,
      impact_note: result.impact_note ?? fallback.impact_note,
      category_confidence: isUnitInterval(result.confidence) ? result.confidence : fallback.category_confidence,
      audience_fit: isUnitInterval(result.audience_fit) ? result.audience_fit : fallback.audience_fit,
    };
  });
};

export const categorizeBatch = async (items: ScoredNewsItem[]): Promise<CategorizedNewsItem[]> => {
  const batches: ScoredNewsItem[][] = [];
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    batches.push(items.slice(i, i + BATCH_SIZE));
  }

  const results = await Promise.all(batches.map(categorizeOneBatch));
  return results.flat();
};
