import { LLM_MODELS, chatCompletion } from '../../lib/llmClient';
import { CategorizedNewsItem, NEWS_CATEGORIES, NewsCategory, ScoredNewsItem } from './newsIngestion.interface';

const BATCH_SIZE = 10;

interface LlmCategorization {
  id: number;
  category: string;
  impact_note: string;
  opportunity_score: number;
}

const isValidCategory = (category: string): category is NewsCategory =>
  (NEWS_CATEGORIES as readonly string[]).includes(category);

const fallbackCategorize = (item: ScoredNewsItem): CategorizedNewsItem => ({
  ...item,
  category: 'Other',
  impact_note: 'Automatically ingested — category/opportunity scoring unavailable for this item.',
  opportunity_score: item.relevance_score ?? item.trend_score,
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
            '"impact_note": "<one sentence on audience fit>", "opportunity_score": <number 0-10> }. ' +
            'Include exactly one element per input item, using the same id.',
        },
        { role: 'user', content: prompt },
      ],
    });
  } catch (err) {
    console.error('[NewsIngestion] Categorization LLM call failed:', err instanceof Error ? err.message : err);
    return batch.map(fallbackCategorize);
  }

  const parsed = parseLlmResponse(raw);
  if (!parsed) {
    console.error('[NewsIngestion] Categorization response was not valid JSON, falling back for entire batch');
    return batch.map(fallbackCategorize);
  }

  const byId = new Map(parsed.map((entry) => [entry.id, entry]));

  return batch.map((item, id) => {
    const result = byId.get(id);
    if (!result || !isValidCategory(result.category) || typeof result.opportunity_score !== 'number') {
      return fallbackCategorize(item);
    }
    return {
      ...item,
      category: result.category,
      impact_note: result.impact_note ?? fallbackCategorize(item).impact_note,
      opportunity_score: result.opportunity_score,
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
