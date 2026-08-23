import { z } from 'zod';

const objectId = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, 'must be a valid MongoDB ObjectId');

/** UTC calendar day, matching the rollup's own bucket key format. */
const dateKey = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be a UTC date in YYYY-MM-DD form');

const getUsageSummaryValidation = z.object({
  query: z.object({
    team_id: objectId.optional(),
    from: dateKey.optional(),
    to: dateKey.optional(),
  }),
});

export const LlmUsageValidation = {
  getUsageSummaryValidation,
};
