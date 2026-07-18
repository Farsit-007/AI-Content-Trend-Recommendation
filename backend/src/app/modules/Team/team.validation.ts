import { z } from 'zod';
import { LLM_TASKS } from '../LlmProvider/llmProvider.interface';
import { NewsCategoryTaxonomyService } from '../NewsCategoryTaxonomy/newsCategoryTaxonomy.service';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'must be a valid MongoDB ObjectId');
const llmTaskEnum = z.enum(LLM_TASKS);

// Any name currently in the global category taxonomy (fixed six + discovered), not just the fixed
// six — see flexible-news-taxonomy-and-relevance. Async since it checks the live taxonomy; the
// `validation` middleware already awaits `schema.parseAsync`.
const subscribedCategoriesSchema = z
  .array(z.string().min(1))
  .max(200)
  .refine(async (categories) => {
    if (categories.length === 0) return true;
    const known = new Set(await NewsCategoryTaxonomyService.listAllCategoryNames());
    return categories.every((c) => known.has(c));
  }, 'One or more subscribed_categories are not in the known category taxonomy');

const createTeamValidation = z.object({
  body: z.object({
    name: z.string({ required_error: 'name is required' }).min(1),
    description: z.string().optional(),
    member_ids: z.array(objectId).optional().default([]),
  }),
});

const updateTeamValidation = z.object({
  body: z.object({
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    voice_profile: z
      .object({
        default_language: z.enum(['bangla', 'english', 'banglish']).default('bangla'),
        custom_instructions: z.string().trim().max(500).optional(),
      })
      .optional(),
    subscribed_categories: subscribedCategoriesSchema.optional(),
    default_style_pack_id: objectId.nullable().optional(),
    default_models: z.record(llmTaskEnum, objectId).optional(),
  }),
});

const addMemberValidation = z.object({
  body: z.object({
    user_id: objectId,
  }),
});

const addCategoryValidation = z.object({
  body: z.object({
    category: z.string({ required_error: 'category is required' }).trim().min(1).max(40),
  }),
});

export const TeamValidation = {
  createTeamValidation,
  updateTeamValidation,
  addMemberValidation,
  addCategoryValidation,
};
