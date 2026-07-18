/**
 * Offline analysis: generates (or regenerates) a style pack's ~300-word style card via the shared
 * `StylePackService.generateCardForPack`, so this CLI path and `POST /:id/generate-card` can never
 * drift in behavior. Re-runnable anytime (idempotent overwrite).
 *
 * Run: npm run style:generate-card -- <slug>
 */
import dns from 'dns';
import mongoose from 'mongoose';
import config from '../app/config';

dns.setServers(['8.8.8.8', '1.1.1.1']);

import { StylePack } from '../app/modules/StylePack/stylePack.model';
import { StylePackService } from '../app/modules/StylePack/stylePack.service';

const [, , slug] = process.argv;

const main = async () => {
  if (!slug) {
    console.error('Usage: npm run style:generate-card -- <slug>');
    process.exit(1);
  }

  await mongoose.connect(config.database_url as string);

  const pack = await StylePack.findOne({ slug });
  if (!pack) {
    console.error(`[generateStyleCard] pack "${slug}" not found`);
    await mongoose.disconnect();
    process.exit(1);
  }

  const packId = (pack._id as mongoose.Types.ObjectId).toString();

  try {
    const card = await StylePackService.generateCardForPack(packId);
    console.log(`[generateStyleCard] pack "${pack.name}" (${slug}) — style card generated:\n`);
    console.log(card);
  } catch (err) {
    console.error(`[generateStyleCard] failed:`, err instanceof Error ? err.message : err);
    await mongoose.disconnect();
    process.exit(1);
  }

  await mongoose.disconnect();
};

main().catch((err) => {
  console.error('[generateStyleCard] failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
