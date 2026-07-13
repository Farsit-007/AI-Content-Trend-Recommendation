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
  }),
});

const addMemberValidation = z.object({
  body: z.object({
    user_id: objectId,
  }),
});

export const TeamValidation = {
  createTeamValidation,
  updateTeamValidation,
  addMemberValidation,
};
