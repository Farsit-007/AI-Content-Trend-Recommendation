/**
 * Bulk-imports example posts into a style pack from a JSON file, creating the pack if it
 * doesn't already exist by slug. Mirrors seedBrandVoice.ts's shape and idempotency approach.
 *
 * Run: npm run seed:style-pack -- <slug> <path/to/examples.json> [--name "Display Name"] [--language bangla|english|banglish]
 * JSON shape: [{ "content": "...", "platform": "facebook", "source_ref": "...", "engagement_hint": "..." }]
 * (see seed/style-pack.example.json)
 *
 * --name and --language are only used when creating a new pack (defaults: a title-cased version
 * of the slug, and "bangla"). They are ignored when the pack already exists.
 *
 * Idempotent: an example whose exact content already exists in the pack is skipped, so the
 * script can be re-run after adding new posts to the file.
 */
import { readFileSync } from 'fs';
import mongoose from 'mongoose';
import { z } from 'zod';
import config from '../app/config';
import { embed } from '../app/lib/embeddings';
import { LanguageStyle } from '../app/modules/Team/team.interface';
import { StyleExample, StylePack } from '../app/modules/StylePack/stylePack.model';

const seedFileSchema = z
  .array(
    z.object({
      content: z.string().trim().min(1),
      platform: z.enum(['facebook', 'linkedin', 'other']).optional(),
      source_ref: z.string().trim().optional(),
      engagement_hint: z.string().trim().optional(),
    }),
  )
  .min(1);

const titleCaseFromSlug = (slug: string): string =>
  slug
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

const parseFlag = (flag: string): string | undefined => {
  const index = process.argv.indexOf(flag);
  return index !== -1 ? process.argv[index + 1] : undefined;
};

const [, , slug, filePath] = process.argv;
const nameFlag = parseFlag('--name');
const languageFlag = parseFlag('--language') as LanguageStyle | undefined;

const main = async () => {
  if (!slug || !filePath) {
    console.error(
      'Usage: npm run seed:style-pack -- <slug> <path/to/examples.json> [--name "Display Name"] [--language bangla|english|banglish]',
    );
    process.exit(1);
  }

  const parsed = seedFileSchema.safeParse(JSON.parse(readFileSync(filePath, 'utf8')));
  if (!parsed.success) {
    console.error('[seedStylePack] invalid seed file:', parsed.error.issues);
    process.exit(1);
  }
  const examples = parsed.data;

  await mongoose.connect(config.database_url as string);

  let pack = await StylePack.findOne({ slug });
  if (!pack) {
    pack = await StylePack.create({
      name: nameFlag ?? titleCaseFromSlug(slug),
      slug,
      language: languageFlag ?? 'bangla',
      tone_tags: [],
      is_active: true,
      created_by: 'seed-script',
    });
    console.log(`[seedStylePack] created new pack "${pack.name}" (${slug})`);
  } else {
    console.log(`[seedStylePack] using existing pack "${pack.name}" (${slug})`);
  }

  const packId = (pack._id as mongoose.Types.ObjectId).toString();

  let created = 0;
  let skipped = 0;
  for (const example of examples) {
    const exists = await StyleExample.exists({ style_pack_id: packId, content: example.content });
    if (exists) {
      skipped += 1;
      continue;
    }

    const embedding = await embed(example.content);
    await StyleExample.create({ ...example, style_pack_id: packId, embedding });
    created += 1;
  }

  const total = await StyleExample.countDocuments({ style_pack_id: packId });
  console.log(
    `[seedStylePack] pack "${pack.name}": ${created} created, ${skipped} skipped (already present), ${total} total examples`,
  );

  await mongoose.disconnect();
};

main().catch((err) => {
  console.error('[seedStylePack] failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
