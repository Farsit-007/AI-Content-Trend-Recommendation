import { logger } from '../../lib/logger';
import { NEWS_CATEGORIES, NewsCategory } from '../NewsIngestion/newsIngestion.interface';
import { NewsCategoryTaxonomy } from './newsCategoryTaxonomy.model';

const DUPLICATE_KEY_CODE = 11000;

export const normalizeKey = (name: string): string => name.trim().toLowerCase();

/**
 * Idempotent — safe to call on every boot (mirrors `seedSuperAdminIfMissing`'s pattern) or from a
 * one-off script. Each fixed category's `broad_group` is itself.
 */
const seedFixedCategories = async (): Promise<void> => {
  for (const category of NEWS_CATEGORIES) {
    await NewsCategoryTaxonomy.updateOne(
      { normalized_key: normalizeKey(category) },
      {
        $setOnInsert: {
          name: category,
          normalized_key: normalizeKey(category),
          broad_group: category,
          source: 'seed',
        },
      },
      { upsert: true },
    );
  }
};

/** Every known category name — fixed six plus everything discovered during ingestion — for
 *  grounding the categorization prompt and for team-subscription validation /
 *  `GET /teams/:id/categories`. */
const listAllCategoryNames = async (): Promise<string[]> => {
  const docs = await NewsCategoryTaxonomy.find().select('name').lean();
  return docs.map((d) => d.name);
};

/** Same as `listAllCategoryNames` but with each entry's broad group too — used to build the
 *  categorization prompt's grounding list. */
const listAllCategories = async (): Promise<{ name: string; broad_group: string }[]> => {
  const docs = await NewsCategoryTaxonomy.find().select('name broad_group').lean();
  return docs.map((d) => ({ name: d.name, broad_group: d.broad_group }));
};

interface ResolvedCategory {
  name: string;
  broad_group: string;
}

/**
 * Resolves a categorization LLM's proposed category name (+ broad group, for a genuinely new one)
 * against the taxonomy: reuses the canonical entry on an exact/normalized (case/whitespace) match;
 * upserts a new entry otherwise. The unique index on `normalized_key` guards a race between two
 * concurrent categorization batches proposing the same new category simultaneously — the loser of
 * that race re-fetches and reuses the winner's entry rather than erroring.
 */
const resolveOrCreateCategory = async (
  proposedName: string,
  proposedGroup: NewsCategory,
): Promise<ResolvedCategory> => {
  const key = normalizeKey(proposedName);
  const existing = await NewsCategoryTaxonomy.findOne({ normalized_key: key });
  if (existing) return { name: existing.name, broad_group: existing.broad_group };

  try {
    const created = await NewsCategoryTaxonomy.create({
      name: proposedName.trim(),
      normalized_key: key,
      broad_group: proposedGroup,
      source: 'ingestion',
    });
    logger.info(`[NewsCategoryTaxonomy] discovered new category "${created.name}" under "${proposedGroup}"`);
    return { name: created.name, broad_group: created.broad_group };
  } catch (err) {
    const code = (err as { code?: number }).code;
    if (code === DUPLICATE_KEY_CODE) {
      const racedExisting = await NewsCategoryTaxonomy.findOne({ normalized_key: key });
      if (racedExisting) return { name: racedExisting.name, broad_group: racedExisting.broad_group };
    }
    throw err;
  }
};

export const NewsCategoryTaxonomyService = {
  seedFixedCategories,
  listAllCategoryNames,
  listAllCategories,
  resolveOrCreateCategory,
};
