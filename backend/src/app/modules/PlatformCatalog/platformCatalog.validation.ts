import { z } from 'zod';

const platformSlug = z
  .string({ required_error: 'name is required' })
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_-]+$/, 'name must contain only lowercase letters, numbers, hyphens, or underscores');

const createPlatformValidation = z.object({
  body: z.object({
    name: platformSlug,
    label: z.string().optional(),
    is_enabled: z.boolean().optional(),
  }),
});

export const PlatformCatalogValidation = {
  createPlatformValidation,
};
