import { ADJUDICATION_SYSTEM_PROMPT } from '../../../scripts/dedupCalibrationPairs';
import { chatCompletionForTask } from '../../lib/modelResolution';
import { logger } from '../../lib/logger';

const BATCH_SIZE = 10;

export type Verdict = 'duplicate' | 'update' | 'distinct';

/** One gray pair to judge, already ordered A = older, B = newer by publication time. */
export interface AdjudicationInput {
  id: number;
  olderTitle: string;
  olderSnippet?: string;
  newerTitle: string;
  newerSnippet?: string;
}

export interface AdjudicationResult {
  verdict: Verdict;
  confidence: number;
  /** True when the verdict is a keep-the-item fallback (transport/parse/validation failure or
   * batch-cap overflow) rather than a real judgment — never a drop. */
  fallback: boolean;
}

/** Keep-the-item fallback: never masquerades as a real verdict, and `update` means "store it". */
const FALLBACK: AdjudicationResult = { verdict: 'update', confidence: 0, fallback: true };

const parseVerdicts = (raw: string): unknown[] | null => {
  const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*$/g, '').trim();
  try {
    const parsed = JSON.parse(cleaned);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const isVerdict = (v: unknown): v is Verdict => v === 'duplicate' || v === 'update' || v === 'distinct';
const isUnitInterval = (n: unknown): n is number => typeof n === 'number' && n >= 0 && n <= 1;

/** Judge one batch (≤ 10 pairs). Mirrors `categorizeBatch`'s discipline: strict-JSON prompt,
 * fence-stripping parse, per-batch fallback on call/parse failure, per-item fallback on a missing
 * id or invalid verdict. Returns results keyed by the input's global id. */
const judgeBatch = async (batch: AdjudicationInput[]): Promise<Map<number, AdjudicationResult>> => {
  const out = new Map<number, AdjudicationResult>();
  const prompt = batch
    .map(
      (p, localId) =>
        `${localId}. A (older): "${p.olderTitle}" — ${p.olderSnippet ?? 'no snippet'}\n` +
        `   B (newer): "${p.newerTitle}" — ${p.newerSnippet ?? 'no snippet'}`,
    )
    .join('\n');

  let raw: string;
  try {
    raw = await chatCompletionForTask(
      'dedup_adjudication',
      [
        { role: 'system', content: ADJUDICATION_SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      { temperature: 0.3 },
    );
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : err }, '[NewsIngestion] adjudication LLM call failed — keeping all pairs in batch');
    batch.forEach((p) => out.set(p.id, FALLBACK));
    return out;
  }

  const parsed = parseVerdicts(raw);
  if (!parsed) {
    logger.error('[NewsIngestion] adjudication response was not valid JSON — keeping entire batch');
    batch.forEach((p) => out.set(p.id, FALLBACK));
    return out;
  }

  const byLocalId = new Map<number, { verdict?: unknown; confidence?: unknown }>();
  parsed.forEach((entry) => {
    if (entry && typeof (entry as { id?: unknown }).id === 'number') {
      byLocalId.set((entry as { id: number }).id, entry as { verdict?: unknown; confidence?: unknown });
    }
  });

  batch.forEach((p, localId) => {
    const entry = byLocalId.get(localId);
    if (!entry || !isVerdict(entry.verdict)) {
      out.set(p.id, FALLBACK);
      return;
    }
    out.set(p.id, {
      verdict: entry.verdict,
      confidence: isUnitInterval(entry.confidence) ? entry.confidence : 0,
      fallback: false,
    });
  });
  return out;
};

/**
 * Adjudicate gray-band pairs in batches of 10 with the standard model. At most `maxBatches` batches
 * are actually sent to the LLM (a per-run cost bound); pairs in overflow batches take the
 * keep-the-item fallback rather than being dropped (design decision 4 — no silent loss).
 */
export const adjudicatePairs = async (
  inputs: AdjudicationInput[],
  maxBatches: number,
): Promise<Map<number, AdjudicationResult>> => {
  const results = new Map<number, AdjudicationResult>();
  const batches: AdjudicationInput[][] = [];
  for (let i = 0; i < inputs.length; i += BATCH_SIZE) {
    batches.push(inputs.slice(i, i + BATCH_SIZE));
  }

  await Promise.all(
    batches.map(async (batch, batchIndex) => {
      if (batchIndex >= maxBatches) {
        batch.forEach((p) => results.set(p.id, FALLBACK));
        return;
      }
      const batchResults = await judgeBatch(batch);
      batchResults.forEach((result, id) => results.set(id, result));
    }),
  );

  return results;
};

/** Number of batches that actually reached the LLM this run (for run-history counters). */
export const batchesUsed = (pairCount: number, maxBatches: number): number =>
  Math.min(Math.ceil(pairCount / BATCH_SIZE), maxBatches);
