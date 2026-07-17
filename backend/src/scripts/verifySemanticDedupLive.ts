import dns from 'dns';
import config from '../app/config';

dns.setServers(['8.8.8.8', '1.1.1.1']);
import { embed, embedBatch } from '../app/lib/embeddings';
import { LLM_MODELS, chatCompletion } from '../app/lib/llmClient';
import { EmbeddedNewsItem, dedupeSemantic } from '../app/modules/NewsIngestion/newsIngestion.utils';
import { ADJUDICATION_SYSTEM_PROMPT, CALIBRATION_PAIRS, CalibrationPair, PairLabel } from './dedupCalibrationPairs';

const CEILING_MARGIN = 0.005;
const JUDGE_BATCH_SIZE = 10;
// Asymmetric acceptance bars: a false "duplicate" is lost news, the expensive error.
const DUPLICATE_BAR = 0.9;
const UPDATE_BAR = 0.95;

const cosine = (a: number[], b: number[]): number => {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
};

const pairText = (item: { title: string; snippet: string }) => `${item.title} ${item.snippet}`.trim();

/** Fence-stripping JSON parse, mirroring categorize.ts discipline. */
const parseVerdicts = (raw: string): unknown[] | null => {
  const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*$/g, '').trim();
  try {
    const parsed = JSON.parse(cleaned);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

/** Embed both sides of every pair (one batched call) and return the per-pair cosine similarity. */
async function embedPairSimilarities(pairs: CalibrationPair[]): Promise<number[]> {
  const texts: string[] = [];
  pairs.forEach((p) => { texts.push(pairText(p.a), pairText(p.b)); });
  const vectors = await embedBatch(texts);
  return pairs.map((_, i) => cosine(vectors[i * 2], vectors[i * 2 + 1]));
}

function distribution(values: number[]) {
  const sorted = [...values].sort((x, y) => x - y);
  const median = sorted.length % 2
    ? sorted[(sorted.length - 1) / 2]
    : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
  return { min: sorted[0], median, max: sorted[sorted.length - 1], n: sorted.length };
}

// ── Mode: --calibrate ────────────────────────────────────────────────────────────────────────
async function runCalibrate(): Promise<number> {
  console.log(`Embedding ${CALIBRATION_PAIRS.length} labeled pairs via the real embedding model...\n`);
  const sims = await embedPairSimilarities(CALIBRATION_PAIRS);

  const byLabel: Record<PairLabel, number[]> = { duplicate: [], update: [], distinct: [] };
  CALIBRATION_PAIRS.forEach((p, i) => byLabel[p.label].push(sims[i]));

  console.log('Per-class cosine similarity distribution:');
  console.log('  class      n    min      median   max');
  (['duplicate', 'update', 'distinct'] as PairLabel[]).forEach((label) => {
    const d = distribution(byLabel[label]);
    console.log(
      `  ${label.padEnd(9)}  ${String(d.n).padStart(2)}   ${d.min.toFixed(4)}   ${d.median.toFixed(4)}   ${d.max.toFixed(4)}`,
    );
  });

  const maxUpdate = Math.max(...byLabel.update);
  const proposedCeiling = maxUpdate + CEILING_MARGIN;
  console.log(`\nMax update-class similarity: ${maxUpdate.toFixed(4)}`);
  console.log(`==> Proposed HARD_DUP ceiling = max(update) + ${CEILING_MARGIN} = ${proposedCeiling.toFixed(4)}`);
  console.log('    (Paste this and the table above into the D2 proposal.)');

  const maxDuplicate = Math.max(...byLabel.duplicate);
  const overlapping = CALIBRATION_PAIRS
    .map((p, i) => ({ p, sim: sims[i] }))
    .filter(({ p, sim }) => p.label === 'update' && sim > maxDuplicate);
  if (overlapping.length) {
    console.log(
      `\n⚠ ${overlapping.length} update pair(s) score above every duplicate pair (> ${maxDuplicate.toFixed(4)}).`,
    );
    console.log('  These are FEW-SHOT candidates for the judge prompt — do NOT raise the ceiling to cover them:');
    overlapping.forEach(({ p, sim }) => console.log(`    [${sim.toFixed(4)}] (${p.klass}) "${p.b.title}"`));
  }

  return 0;
}

// ── Mode: --judge ────────────────────────────────────────────────────────────────────────────
async function runJudge(): Promise<number> {
  const threshold = config.news_ingestion.semantic_dedup_threshold;
  console.log(`Embedding ${CALIBRATION_PAIRS.length} pairs to find the gray band (>= ${threshold})...\n`);
  const sims = await embedPairSimilarities(CALIBRATION_PAIRS);

  const grayBand = CALIBRATION_PAIRS
    .map((p, i) => ({ p, sim: sims[i], index: i }))
    .filter(({ sim }) => sim >= threshold);

  console.log(`Gray-band pairs (>= ${threshold}): ${grayBand.length} of ${CALIBRATION_PAIRS.length}`);
  if (!grayBand.length) {
    console.log('No pairs fell in the gray band — nothing to judge. (Check the threshold / pair set.)');
    return 1;
  }

  // Predicted verdict per gray-band local index; 'error' when the judge output is unusable.
  const predictions = new Map<number, PairLabel | 'error'>();

  for (let start = 0; start < grayBand.length; start += JUDGE_BATCH_SIZE) {
    const batch = grayBand.slice(start, start + JUDGE_BATCH_SIZE);
    const userPrompt = batch
      .map(({ p }, id) =>
        `${id}. A (older): "${p.a.title}" — ${p.a.snippet}\n` +
        `   B (newer): "${p.b.title}" — ${p.b.snippet}`,
      )
      .join('\n');

    let raw: string;
    try {
      raw = await chatCompletion({
        model: LLM_MODELS.standard,
        temperature: 0.3,
        messages: [
          { role: 'system', content: ADJUDICATION_SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
      });
    } catch (err) {
      console.error(`  Batch @${start} LLM call failed: ${err instanceof Error ? err.message : err}`);
      batch.forEach((_, id) => predictions.set(start + id, 'error'));
      continue;
    }

    const parsed = parseVerdicts(raw);
    if (!parsed) {
      console.error(`  Batch @${start} response was not valid JSON.`);
      batch.forEach((_, id) => predictions.set(start + id, 'error'));
      continue;
    }

    const byId = new Map<number, { verdict?: unknown }>();
    parsed.forEach((entry) => {
      if (entry && typeof (entry as { id?: unknown }).id === 'number') {
        byId.set((entry as { id: number }).id, entry as { verdict?: unknown });
      }
    });

    batch.forEach((_, id) => {
      const verdict = byId.get(id)?.verdict;
      predictions.set(
        start + id,
        verdict === 'duplicate' || verdict === 'update' || verdict === 'distinct' ? verdict : 'error',
      );
    });
  }

  // Confusion matrix: rows = actual label, cols = predicted verdict (incl. error).
  const cols: (PairLabel | 'error')[] = ['duplicate', 'update', 'distinct', 'error'];
  const matrix: Record<PairLabel, Record<string, number>> = {
    duplicate: { duplicate: 0, update: 0, distinct: 0, error: 0 },
    update: { duplicate: 0, update: 0, distinct: 0, error: 0 },
    distinct: { duplicate: 0, update: 0, distinct: 0, error: 0 },
  };
  grayBand.forEach(({ p }, localIdx) => {
    matrix[p.label][predictions.get(localIdx) ?? 'error'] += 1;
  });

  console.log('\nConfusion matrix (rows = actual, cols = predicted):');
  console.log(`  actual\\pred   ${cols.map((c) => c.padStart(9)).join(' ')}`);
  (['duplicate', 'update', 'distinct'] as PairLabel[]).forEach((label) => {
    const row = cols.map((c) => String(matrix[label][c]).padStart(9)).join(' ');
    console.log(`  ${label.padEnd(11)} ${row}`);
  });

  const accuracy = (label: PairLabel) => {
    const total = cols.reduce((s, c) => s + matrix[label][c], 0);
    return total ? matrix[label][label] / total : 1;
  };
  const dupAcc = accuracy('duplicate');
  const updAcc = accuracy('update');

  console.log('\n--- Bars ---');
  console.log(`  duplicate correct: ${(dupAcc * 100).toFixed(1)}%  (bar ${DUPLICATE_BAR * 100}%): ${dupAcc >= DUPLICATE_BAR ? 'PASS' : 'FAIL'}`);
  console.log(`  update correct:    ${(updAcc * 100).toFixed(1)}%  (bar ${UPDATE_BAR * 100}%): ${updAcc >= UPDATE_BAR ? 'PASS' : 'FAIL'}`);
  console.log('  (Paste this matrix + bar result into the D2 proposal. If the update bar fails, apply the');
  console.log('   design-4 contingency: add worst-missed pairs as few-shot examples, then two-tier escalation.)');

  return dupAcc >= DUPLICATE_BAR && updAcc >= UPDATE_BAR ? 0 : 1;
}

// ── Default mode: the original 3-item regression ───────────────────────────────────────────────
const rawItem = (
  sourceId: string,
  title: string,
  snippet: string,
  points: number,
): Omit<EmbeddedNewsItem, 'embedding'> => ({
  source: 'live-verify',
  source_id: sourceId,
  content_hash: `live-verify:${sourceId}`,
  title,
  url: `https://example.com/${sourceId}`,
  snippet,
  raw_points: points,
  raw_comments: 0,
  raw_stars_delta: 0,
});

async function runDefault(): Promise<number> {
  const candidates = [
    rawItem(
      'a-hn',
      'OpenAI releases GPT-5.5 with major reasoning improvements',
      'The new model shows significant gains on math and coding benchmarks compared to its predecessor.',
      50,
    ),
    rawItem(
      'b-devto',
      'GPT-5.5 launches from OpenAI, bringing big reasoning upgrades',
      'OpenAI just shipped an updated model with large improvements to math and coding benchmark performance.',
      300,
    ),
    rawItem(
      'c-reddit',
      'Show HN: I built a CLI tool to manage dotfiles across machines',
      'A small Rust utility that syncs your shell config, vim settings, and aliases between computers.',
      12,
    ),
  ];

  console.log('Embedding 3 candidate items via real OpenRouter embeddings...');
  const embedded: EmbeddedNewsItem[] = await Promise.all(
    candidates.map(async (item) => ({ ...item, embedding: await embed(`${item.title} ${item.snippet}`.trim()) })),
  );

  const gptSim = cosine(embedded[0].embedding, embedded[1].embedding);
  console.log(`Cosine similarity — GPT-5.5 (HN) vs GPT-5.5 (Dev.to): ${gptSim.toFixed(4)}`);
  console.log(
    `Cosine similarity — GPT-5.5 (HN) vs dotfiles CLI (unrelated): ${cosine(embedded[0].embedding, embedded[2].embedding).toFixed(4)}`,
  );

  const floor = config.news_ingestion.semantic_dedup_threshold;
  const ceiling = config.news_ingestion.hard_dup_threshold;
  console.log(`Bands: floor ${floor}, ceiling ${ceiling}`);

  // Route against an EMPTY pool so the regression is deterministic and needs neither DB nor LLM —
  // the cross-source near-duplicate is an in-run property. Under two-band dedup the ~0.899 GPT pair
  // lands in the GRAY band (adjudication territory) rather than auto-collapsing; the live full-run
  // (verify §5.3) covers the LLM-judged collapse + corroboration.
  const routing = dedupeSemantic(embedded, [], floor, ceiling);
  const acceptedIds = new Set(routing.accepted.map((s) => s.source_id));
  console.log(
    `\n3 candidates in -> accepted ${routing.accepted.length}, gray pairs ${routing.grayPairs.length}, ` +
      `hard-dup drops ${routing.hardStoredDrops.length}`,
  );
  routing.accepted.forEach((s) => console.log(`  accepted: ${s.source_id} "${s.title}"`));
  routing.grayPairs.forEach((g) => console.log(`  gray: ${g.candidate.source_id} (sim ${g.similarity.toFixed(4)})`));

  // The ~0.899 GPT pair is expected to sit in [floor, ceiling): b-devto becomes the one gray pair
  // against the a-hn anchor. If calibration ever drifts it out of the band, this fails loudly.
  const gptRoutedGray =
    gptSim >= floor &&
    gptSim < ceiling &&
    routing.grayPairs.length === 1 &&
    routing.grayPairs[0].candidate.source_id === 'b-devto';
  const distinctAccepted = acceptedIds.has('c-reddit');
  const firstGptAccepted = acceptedIds.has('a-hn');

  console.log('\n--- Results ---');
  console.log(`[route] Near-duplicate GPT pair routed to the gray band (not auto-dropped): ${gptRoutedGray ? 'PASS' : 'FAIL'}`);
  console.log(`[route] First GPT item accepted as the in-run anchor: ${firstGptAccepted ? 'PASS' : 'FAIL'}`);
  console.log(`[route] Distinct unrelated item (dotfiles CLI) accepted untouched: ${distinctAccepted ? 'PASS' : 'FAIL'}`);

  return gptRoutedGray && firstGptAccepted && distinctAccepted ? 0 : 1;
}

async function main() {
  const args = process.argv.slice(2);
  const mode = args.includes('--calibrate') ? 'calibrate' : args.includes('--judge') ? 'judge' : 'default';

  // All three modes work in memory against the embedding/LLM APIs only — no DB connection needed
  // (default mode now routes against an empty in-memory pool for determinism).
  let exitCode: number;
  if (mode === 'calibrate') exitCode = await runCalibrate();
  else if (mode === 'judge') exitCode = await runJudge();
  else exitCode = await runDefault();

  process.exit(exitCode);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
