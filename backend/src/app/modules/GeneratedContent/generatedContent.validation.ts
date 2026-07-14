import { z } from 'zod';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'must be a valid MongoDB ObjectId');

const listGeneratedContentValidation = z.object({
  query: z.object({
    team_id: objectId,
    status: z.enum(['draft', 'approved', 'dismissed']).optional(),
    source: z.enum(['auto', 'manual']).optional(),
    page: z.string().optional(),
    limit: z.string().optional(),
  }),
});

const updateGeneratedContentValidation = z.object({
  params: z.object({ id: objectId }),
  body: z.object({
    status: z.enum(['approved', 'dismissed'], {
      required_error: 'status is required',
      invalid_type_error: 'status must be "approved" or "dismissed"',
    }),
  }),
});

const triggerAutoGenerationValidation = z.object({
  body: z.object({
    team_id: objectId.optional(),
  }),
});

export const GeneratedContentValidation = {
  listGeneratedContentValidation,
  updateGeneratedContentValidation,
  triggerAutoGenerationValidation,
};
