import { z } from 'zod';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'must be a valid MongoDB ObjectId');

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
