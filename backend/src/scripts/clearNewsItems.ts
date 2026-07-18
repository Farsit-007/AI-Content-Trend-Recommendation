/**
 * Narrower reset for the "just re-ingest from scratch" case: clears only `news_items` and
 * `news_dedup_ledger`, leaving teams/users/style packs/brand voice examples intact. Same safety
 * rails as resetDevData.ts (production refusal, --yes or typed confirmation, pre/post summaries) —
 * a separate command rather than a `--scope` flag on one script, so you can't fat-finger a full
 * wipe when you meant a news-only one.
 *
 * Run: npm run dev:clear-news -- --yes
 *
 * This script is never invoked by the running server — operator tooling only.
 */
import mongoose from 'mongoose';
import readline from 'readline';
import config from '../app/config';

const COLLECTIONS_TO_CLEAR = ['news_items', 'news_dedup_ledger'];

const args = process.argv.slice(2);
const autoConfirm = args.includes('--yes');

const redactedDbHost = (url: string): string => {
  try {
    return new URL(url.replace(/^mongodb(\+srv)?:\/\//, 'http://')).host;
  } catch {
    return '(unparseable DATABASE_URL)';
  }
};

const promptTypedConfirmation = (question: string): Promise<string> =>
  new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });

const main = async () => {
  if (config.node_env === 'production') {
    console.error('[clearNewsItems] refusing to run — NODE_ENV is "production"');
    process.exit(1);
  }

  await mongoose.connect(config.database_url as string);
  const db = mongoose.connection.db;
  if (!db) throw new Error('Mongoose connected but connection.db is undefined');

  const dbName = db.databaseName;
  console.log(`[clearNewsItems] target: ${redactedDbHost(config.database_url as string)} / database "${dbName}"`);
  console.log('[clearNewsItems] this will delete ALL documents in:');

  const preCounts: Record<string, number> = {};
  for (const name of COLLECTIONS_TO_CLEAR) {
    preCounts[name] = await db.collection(name).countDocuments();
    console.log(`  - ${name}: ${preCounts[name]} document(s)`);
  }
  console.log('(teams, users, style packs, and brand voice examples are left untouched)');

  if (!autoConfirm) {
    if (!process.stdin.isTTY) {
      console.error('[clearNewsItems] no --yes flag and not running interactively — refusing to delete anything');
      await mongoose.disconnect();
      process.exit(1);
    }
    const answer = await promptTypedConfirmation(
      `\nType the database name ("${dbName}") to confirm clearing news items: `,
    );
    if (answer.trim() !== dbName) {
      console.error('[clearNewsItems] confirmation did not match — aborting, nothing was deleted');
      await mongoose.disconnect();
      process.exit(1);
    }
  }

  console.log('\n[clearNewsItems] deleting...');
  const deletedCounts: Record<string, number> = {};
  for (const name of COLLECTIONS_TO_CLEAR) {
    const result = await db.collection(name).deleteMany({});
    deletedCounts[name] = result.deletedCount ?? 0;
  }

  console.log('\n[clearNewsItems] done — deleted counts:');
  for (const [name, count] of Object.entries(deletedCounts)) {
    console.log(`  - ${name}: ${count}`);
  }

  await mongoose.disconnect();
};

main().catch((err) => {
  console.error('[clearNewsItems] failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
