import { z } from 'zod';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'must be a valid MongoDB ObjectId');

const setOverrideValidation = z.object({
  body: z
    .object({
      team_id: objectId,
      category: z.string().min(1).optional(),
      opportunity_score: z.number().min(0).max(10).optional(),
    })
    .refine((data) => data.category !== undefined || data.opportunity_score !== undefined, {
      message: 'At least one of category or opportunity_score must be provided',
    }),
});

const clearOverrideValidation = z.object({
  body: z.object({
    team_id: objectId,
  }),
});

export const NewsItemCategoryOverrideValidation = {
  setOverrideValidation,
  clearOverrideValidation,
};
