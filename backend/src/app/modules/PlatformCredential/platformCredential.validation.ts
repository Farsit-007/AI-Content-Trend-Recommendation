import { z } from 'zod';

const upsertCredentialValidation = z.object({
  body: z.object({
    // Any social platform slug (facebook, youtube, linkedin, reddit, twitter, instagram, tiktok, ...)
    // — lowercased, hyphen/underscore allowed, no fixed enum.
    platform: z
      .string({ required_error: 'platform is required' })
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9_-]+$/, 'platform must contain only lowercase letters, numbers, hyphens, or underscores'),
    token: z.string({ required_error: 'token is required' }).min(1),
    account_id: z.string().optional(),
  }),
});

export const PlatformCredentialValidation = {
  upsertCredentialValidation,
};
