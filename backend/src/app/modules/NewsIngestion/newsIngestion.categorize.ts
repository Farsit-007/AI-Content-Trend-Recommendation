import { chatCompletionForTask } from '../../lib/modelResolution';
import { logger } from '../../lib/logger';
import { NewsCategoryTaxonomyService } from '../NewsCategoryTaxonomy/newsCategoryTaxonomy.service';
import { CategorizedNewsItem, NEWS_CATEGORIES, NewsCategory, ScoredNewsItem } from './newsIngestion.interface';

const BATCH_SIZE = 10;

interface LlmCategorization {
  id: number;
  category: string;
  /** Only meaningful/required when `category` is a genuinely new proposal — see
   *  `resolveCategorization` below, which re-derives the group from the taxonomy for any category
   *  that already exists, ignoring this field to prevent drift. */
  broad_group: string;
  impact_note: string;
  confidence: number;
  audience_fit: number;
}

const isValidBroadGroup = (group: string): group is NewsCategory =>
  (NEWS_CATEGORIES as readonly string[]).includes(group);

const isUnitInterval = (n: unknown): n is number => typeof n === 'number' && n >= 0 && n <= 1;

// Cold, low-confidence fallback so a parse/validation failure never masquerades as a real
// AI judgment — this drives `needs_review: true` and a fit derived from relevance alone.
const fallbackCategorize = (item: ScoredNewsItem): CategorizedNewsItem => ({
  ...item,
  category: 'Other',
  category_group: 'Other',
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

/**
 * Resolves one LLM-proposed `{ category, broad_group }` pair against the global taxonomy: an
 * existing category (exact or normalized match) always wins with its already-recorded broad
 * group — the model's `broad_group` guess for an existing category is ignored, preventing drift
 * from a model changing its mind about where a category belongs on a later run. A genuinely new
 * category is created with the model's proposed group (falling back to "Other" if that group
 * itself doesn't validate against the fixed six).
 */
const resolveCategorization = async (
  proposedCategory: string,
  proposedGroup: string,
): Promise<{ name: string; broad_group: NewsCategory }> => {
  const safeGroup: NewsCategory = isValidBroadGroup(proposedGroup) ? proposedGroup : 'Other';
  const resolved = await NewsCategoryTaxonomyService.resolveOrCreateCategory(proposedCategory, safeGroup);
  return { name: resolved.name, broad_group: resolved.broad_group as NewsCategory };
};

const buildSystemPrompt = (knownCategories: { name: string; broad_group: string }[]): string => {
  const categoryList = knownCategories.map((c) => `"${c.name}" (under "${c.broad_group}")`).join(', ');
  return (
    'You categorize tech news items for a social media growth team. Respond with ONLY a strict JSON array, ' +
    'no markdown fences, no commentary. Each element must be: ' +
    '{ "id": <number>, "category": "<a category name>", "broad_group": "AI"|"Web Dev"|"Career"|"Security"|"DevOps"|"Other", ' +
    '"impact_note": "<one sentence on audience fit>", "confidence": <number 0-1, how sure you are of the category>, ' +
    '"audience_fit": <number 0-1, how well this topic fits a growth/social content team\'s audience, ' +
    'independent of how trendy or on-brand it already scored> }. ' +
    `Known categories already in use (reuse one of these whenever it reasonably fits the item — do not invent a ` +
    `near-duplicate of an existing one, e.g. do not propose "Artificial Intelligence" when "AI" already exists): ` +
    `${categoryList}. ` +
    'Only propose a genuinely new category when none of the known ones reasonably fit — when you do, "category" ' +
    'is your new, specific proposal and "broad_group" MUST be the one of the six fixed groups (AI/Web Dev/Career/' +
    'Security/DevOps/Other) it belongs under. For an existing category, "broad_group" is ignored (the system ' +
    'already knows it), so just repeat any of the six. ' +
    'Include exactly one element per input item, using the same id.'
  );
};

const categorizeOneBatch = async (
  batch: ScoredNewsItem[],
  knownCategories: { name: string; broad_group: string }[],
): Promise<CategorizedNewsItem[]> => {
  const prompt = batch
    .map((item, id) => {
      const contentLead = item.content ? ` — content: ${item.content.slice(0, 500)}` : '';
      return `${id}. "${item.title}" — ${item.snippet ?? 'no snippet'}${contentLead} (relevance_score=${item.relevance_score ?? 'n/a'}, trend_score=${item.trend_score})`;
    })
    .join('\n');

  let raw: string;
  try {
    raw = await chatCompletionForTask(
      'categorization',
      [
        { role: 'system', content: buildSystemPrompt(knownCategories) },
        { role: 'user', content: prompt },
      ],
      { temperature: 0.3 },
    );
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

  return Promise.all(
    batch.map(async (item, id) => {
      const result = byId.get(id);
      const fallback = fallbackCategorize(item);
      if (!result || typeof result.category !== 'string' || !result.category.trim()) {
        return fallback;
      }

      const { name, broad_group } = await resolveCategorization(result.category, result.broad_group);
      return {
        ...item,
        category: name,
        category_group: broad_group,
        impact_note: result.impact_note ?? fallback.impact_note,
        category_confidence: isUnitInterval(result.confidence) ? result.confidence : fallback.category_confidence,
        audience_fit: isUnitInterval(result.audience_fit) ? result.audience_fit : fallback.audience_fit,
      };
    }),
  );
};

export interface CategorizationOutcome {
  items: CategorizedNewsItem[];
  /** How many items were categorized by the LLM. */
  llm_categorized: number;
  /** How many exceeded `maxItems` and took the fallback instead of an LLM call. */
  cap_deferred: number;
}

/**
 * Splits `items` at `maxItems`, keeping the highest `trend_score` for the LLM.
 *
 * Layer 4 is the only unbounded LLM cost in the pipeline — adjudication has
 * `NEWS_INGESTION_ADJUDICATION_MAX_BATCHES`, but categorization previously called once per ~10
 * survivors with no ceiling. That was survivable while relevance gated storage; since every deduped
 * fresh item now reaches this layer, a source that suddenly returns 10× its usual volume (an API
 * change, a new Mastodon instance, a scrape that stops paginating) converts directly into 10× the
 * spend with no alert.
 *
 * Overflow items are **not dropped** — they take the same low-confidence fallback a parse failure
 * would, which sets `needs_review`, so they are still stored, still visible, and surfaced in the
 * review queue rather than silently lost.
 */
export const splitAtCap = (
  items: ScoredNewsItem[],
  maxItems: number,
): { toCategorize: ScoredNewsItem[]; deferred: ScoredNewsItem[] } => {
  if (maxItems <= 0 || items.length <= maxItems) {
    return { toCategorize: items, deferred: [] };
  }
  const ranked = [...items].sort((a, b) => b.trend_score - a.trend_score);
  return { toCategorize: ranked.slice(0, maxItems), deferred: ranked.slice(maxItems) };
};

export const categorizeBatch = async (
  allItems: ScoredNewsItem[],
  maxItems: number = Number.POSITIVE_INFINITY,
): Promise<CategorizationOutcome> => {
  const { toCategorize: items, deferred } = splitAtCap(allItems, maxItems);

  if (deferred.length > 0) {
    // Logged loudly and reported to `ingestion_runs` (see the service) — a silent cap would read as
    // full coverage, exactly the blind spot run observability exists to close.
    logger.warn(
      `[NewsIngestion] Categorization cap reached: ${items.length}/${allItems.length} items sent to the LLM, ` +
        `${deferred.length} stored with the fallback category and needs_review instead`,
    );
  }

  const batches: ScoredNewsItem[][] = [];
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    batches.push(items.slice(i, i + BATCH_SIZE));
  }

  // Fetched once per ingestion run (not once per batch) so every batch grounds against the same
  // known-category snapshot — a category discovered by an earlier batch in this same run is not
  // visible to a later batch's prompt either way (it isn't refetched mid-run), which is fine: a
  // duplicate proposal within the same run is still caught by `resolveOrCreateCategory`'s
  // normalized-key lookup/race guard, just not by prompt-grounding for that one run.
  const knownCategories = await NewsCategoryTaxonomyService.listAllCategories();

  const results = await Promise.all(batches.map((batch) => categorizeOneBatch(batch, knownCategories)));
  return {
    items: [...results.flat(), ...deferred.map(fallbackCategorize)],
    llm_categorized: items.length,
    cap_deferred: deferred.length,
  };
};
