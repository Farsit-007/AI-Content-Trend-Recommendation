/**
 * Seeds a team's brand_voice_examples from a JSON file of real posts. These examples are
 * what personalize every LLM output for the team (few-shot retrieval in content generation) —
 * seed 25–30 real high-engagement posts in the team's actual language/style (Bangla script,
 * English, or mixed) covering the main categories.
 *
 * Run: npm run seed:brand-voice -- <team_id> <path/to/posts.json>
 * JSON shape: [{ "platform": "facebook", "category": "AI", "content": "...", "engagement_hint": "2.4k likes" }]
 * (see seed/brand-voice.example.json)
 *
 * Idempotent: an example whose exact content already exists for the team is skipped, so the
 * script can be re-run after adding new posts to the file.
 */
import { readFileSync } from 'fs';
import mongoose from 'mongoose';
import { z } from 'zod';
import config from '../app/config';
import { embed } from '../app/lib/embeddings';
import { BrandVoiceExample } from '../app/modules/BrandVoiceExample/brandVoiceExample.model';
import { Team } from '../app/modules/Team/team.model';

const seedFileSchema = z
  .array(
    z.object({
      platform: z.string().trim().min(1),
      category: z.string().trim().min(1).optional(),
      content: z.string().trim().min(1),
      engagement_hint: z.string().trim().optional(),
    }),
  )
  .min(1);

const [, , teamId, filePath] = process.argv;

const main = async () => {
  if (!teamId || !filePath) {
    console.error('Usage: npm run seed:brand-voice -- <team_id> <path/to/posts.json>');
    process.exit(1);
  }

  const parsed = seedFileSchema.safeParse(JSON.parse(readFileSync(filePath, 'utf8')));
  if (!parsed.success) {
    console.error('[seedBrandVoice] invalid seed file:', parsed.error.issues);
    process.exit(1);
  }
  const posts = parsed.data;

  await mongoose.connect(config.database_url as string);

  const team = await Team.findById(teamId);
  if (!team) {
    console.error(`[seedBrandVoice] team "${teamId}" not found`);
    await mongoose.disconnect();
    process.exit(1);
  }

  let created = 0;
  let skipped = 0;
  for (const post of posts) {
    const exists = await BrandVoiceExample.exists({ team_id: teamId, content: post.content });
    if (exists) {
      skipped += 1;
      continue;
    }

    const embedding = await embed(post.content);
    await BrandVoiceExample.create({ ...post, team_id: teamId, embedding, added_by: 'seed-script' });
    created += 1;
  }

  const total = await BrandVoiceExample.countDocuments({ team_id: teamId });
  console.log(
    `[seedBrandVoice] team "${team.name}": ${created} created, ${skipped} skipped (already present), ${total} total examples`,
  );
  if (total < 25) {
    console.log(
      `[seedBrandVoice] tip: aim for 25–30 examples across your main categories for reliable voice matching (currently ${total})`,
    );
  }

  await mongoose.disconnect();
};

main().catch((err) => {
  console.error('[seedBrandVoice] failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
