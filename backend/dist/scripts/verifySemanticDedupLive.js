"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dns_1 = __importDefault(require("dns"));
const mongoose_1 = __importDefault(require("mongoose"));
const config_1 = __importDefault(require("../app/config"));
dns_1.default.setServers(['8.8.8.8', '1.1.1.1']);
const embeddings_1 = require("../app/lib/embeddings");
const llmClient_1 = require("../app/lib/llmClient");
const newsIngestion_utils_1 = require("../app/modules/NewsIngestion/newsIngestion.utils");
const dedupCalibrationPairs_1 = require("./dedupCalibrationPairs");
const CEILING_MARGIN = 0.005;
const JUDGE_BATCH_SIZE = 10;
// Asymmetric acceptance bars: a false "duplicate" is lost news, the expensive error.
const DUPLICATE_BAR = 0.9;
const UPDATE_BAR = 0.95;
const cosine = (a, b) => {
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        na += a[i] * a[i];
        nb += b[i] * b[i];
    }
    return dot / (Math.sqrt(na) * Math.sqrt(nb));
};
const pairText = (item) => `${item.title} ${item.snippet}`.trim();
/** Fence-stripping JSON parse, mirroring categorize.ts discipline. */
const parseVerdicts = (raw) => {
    const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*$/g, '').trim();
    try {
        const parsed = JSON.parse(cleaned);
        return Array.isArray(parsed) ? parsed : null;
    }
    catch (_a) {
        return null;
    }
};
/** Embed both sides of every pair (one batched call) and return the per-pair cosine similarity. */
function embedPairSimilarities(pairs) {
    return __awaiter(this, void 0, void 0, function* () {
        const texts = [];
        pairs.forEach((p) => { texts.push(pairText(p.a), pairText(p.b)); });
        const vectors = yield (0, embeddings_1.embedBatch)(texts);
        return pairs.map((_, i) => cosine(vectors[i * 2], vectors[i * 2 + 1]));
    });
}
function distribution(values) {
    const sorted = [...values].sort((x, y) => x - y);
    const median = sorted.length % 2
        ? sorted[(sorted.length - 1) / 2]
        : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
    return { min: sorted[0], median, max: sorted[sorted.length - 1], n: sorted.length };
}
// ── Mode: --calibrate ────────────────────────────────────────────────────────────────────────
function runCalibrate() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log(`Embedding ${dedupCalibrationPairs_1.CALIBRATION_PAIRS.length} labeled pairs via the real embedding model...\n`);
        const sims = yield embedPairSimilarities(dedupCalibrationPairs_1.CALIBRATION_PAIRS);
        const byLabel = { duplicate: [], update: [], distinct: [] };
        dedupCalibrationPairs_1.CALIBRATION_PAIRS.forEach((p, i) => byLabel[p.label].push(sims[i]));
        console.log('Per-class cosine similarity distribution:');
        console.log('  class      n    min      median   max');
        ['duplicate', 'update', 'distinct'].forEach((label) => {
            const d = distribution(byLabel[label]);
            console.log(`  ${label.padEnd(9)}  ${String(d.n).padStart(2)}   ${d.min.toFixed(4)}   ${d.median.toFixed(4)}   ${d.max.toFixed(4)}`);
        });
        const maxUpdate = Math.max(...byLabel.update);
        const proposedCeiling = maxUpdate + CEILING_MARGIN;
        console.log(`\nMax update-class similarity: ${maxUpdate.toFixed(4)}`);
        console.log(`==> Proposed HARD_DUP ceiling = max(update) + ${CEILING_MARGIN} = ${proposedCeiling.toFixed(4)}`);
        console.log('    (Paste this and the table above into the D2 proposal.)');
        const maxDuplicate = Math.max(...byLabel.duplicate);
        const overlapping = dedupCalibrationPairs_1.CALIBRATION_PAIRS
            .map((p, i) => ({ p, sim: sims[i] }))
            .filter(({ p, sim }) => p.label === 'update' && sim > maxDuplicate);
        if (overlapping.length) {
            console.log(`\n⚠ ${overlapping.length} update pair(s) score above every duplicate pair (> ${maxDuplicate.toFixed(4)}).`);
            console.log('  These are FEW-SHOT candidates for the judge prompt — do NOT raise the ceiling to cover them:');
            overlapping.forEach(({ p, sim }) => console.log(`    [${sim.toFixed(4)}] (${p.klass}) "${p.b.title}"`));
        }
        return 0;
    });
}
// ── Mode: --judge ────────────────────────────────────────────────────────────────────────────
function runJudge() {
    return __awaiter(this, void 0, void 0, function* () {
        const threshold = config_1.default.news_ingestion.semantic_dedup_threshold;
        console.log(`Embedding ${dedupCalibrationPairs_1.CALIBRATION_PAIRS.length} pairs to find the gray band (>= ${threshold})...\n`);
        const sims = yield embedPairSimilarities(dedupCalibrationPairs_1.CALIBRATION_PAIRS);
        const grayBand = dedupCalibrationPairs_1.CALIBRATION_PAIRS
            .map((p, i) => ({ p, sim: sims[i], index: i }))
            .filter(({ sim }) => sim >= threshold);
        console.log(`Gray-band pairs (>= ${threshold}): ${grayBand.length} of ${dedupCalibrationPairs_1.CALIBRATION_PAIRS.length}`);
        if (!grayBand.length) {
            console.log('No pairs fell in the gray band — nothing to judge. (Check the threshold / pair set.)');
            return 1;
        }
        // Predicted verdict per gray-band local index; 'error' when the judge output is unusable.
        const predictions = new Map();
        for (let start = 0; start < grayBand.length; start += JUDGE_BATCH_SIZE) {
            const batch = grayBand.slice(start, start + JUDGE_BATCH_SIZE);
            const userPrompt = batch
                .map(({ p }, id) => `${id}. A (older): "${p.a.title}" — ${p.a.snippet}\n` +
                `   B (newer): "${p.b.title}" — ${p.b.snippet}`)
                .join('\n');
            let raw;
            try {
                raw = yield (0, llmClient_1.chatCompletion)({
                    model: llmClient_1.LLM_MODELS.standard,
                    temperature: 0.3,
                    messages: [
                        { role: 'system', content: dedupCalibrationPairs_1.ADJUDICATION_SYSTEM_PROMPT },
                        { role: 'user', content: userPrompt },
                    ],
                });
            }
            catch (err) {
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
            const byId = new Map();
            parsed.forEach((entry) => {
                if (entry && typeof entry.id === 'number') {
                    byId.set(entry.id, entry);
                }
            });
            batch.forEach((_, id) => {
                var _a;
                const verdict = (_a = byId.get(id)) === null || _a === void 0 ? void 0 : _a.verdict;
                predictions.set(start + id, verdict === 'duplicate' || verdict === 'update' || verdict === 'distinct' ? verdict : 'error');
            });
        }
        // Confusion matrix: rows = actual label, cols = predicted verdict (incl. error).
        const cols = ['duplicate', 'update', 'distinct', 'error'];
        const matrix = {
            duplicate: { duplicate: 0, update: 0, distinct: 0, error: 0 },
            update: { duplicate: 0, update: 0, distinct: 0, error: 0 },
            distinct: { duplicate: 0, update: 0, distinct: 0, error: 0 },
        };
        grayBand.forEach(({ p }, localIdx) => {
            var _a;
            matrix[p.label][(_a = predictions.get(localIdx)) !== null && _a !== void 0 ? _a : 'error'] += 1;
        });
        console.log('\nConfusion matrix (rows = actual, cols = predicted):');
        console.log(`  actual\\pred   ${cols.map((c) => c.padStart(9)).join(' ')}`);
        ['duplicate', 'update', 'distinct'].forEach((label) => {
            const row = cols.map((c) => String(matrix[label][c]).padStart(9)).join(' ');
            console.log(`  ${label.padEnd(11)} ${row}`);
        });
        const accuracy = (label) => {
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
    });
}
// ── Default mode: the original 3-item regression ───────────────────────────────────────────────
const rawItem = (sourceId, title, snippet, points) => ({
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
function runDefault() {
    return __awaiter(this, void 0, void 0, function* () {
        const candidates = [
            rawItem('a-hn', 'OpenAI releases GPT-5.5 with major reasoning improvements', 'The new model shows significant gains on math and coding benchmarks compared to its predecessor.', 50),
            rawItem('b-devto', 'GPT-5.5 launches from OpenAI, bringing big reasoning upgrades', 'OpenAI just shipped an updated model with large improvements to math and coding benchmark performance.', 300),
            rawItem('c-reddit', 'Show HN: I built a CLI tool to manage dotfiles across machines', 'A small Rust utility that syncs your shell config, vim settings, and aliases between computers.', 12),
        ];
        console.log('Embedding 3 candidate items via real OpenRouter embeddings...');
        const embedded = yield Promise.all(candidates.map((item) => __awaiter(this, void 0, void 0, function* () { return (Object.assign(Object.assign({}, item), { embedding: yield (0, embeddings_1.embed)(`${item.title} ${item.snippet}`.trim()) })); })));
        console.log(`Cosine similarity — GPT-5.5 (HN) vs GPT-5.5 (Dev.to): ${cosine(embedded[0].embedding, embedded[1].embedding).toFixed(4)}`);
        console.log(`Cosine similarity — GPT-5.5 (HN) vs dotfiles CLI (unrelated): ${cosine(embedded[0].embedding, embedded[2].embedding).toFixed(4)}`);
        const cutoff = new Date(Date.now() - config_1.default.news_ingestion.max_age_hours * 60 * 60 * 1000);
        const recentPool = yield (0, newsIngestion_utils_1.fetchRecentEmbeddings)(cutoff);
        console.log(`Recently-stored pool size (real NewsItem docs, last ${config_1.default.news_ingestion.max_age_hours}h): ${recentPool.length}`);
        const threshold = config_1.default.news_ingestion.semantic_dedup_threshold;
        console.log(`Threshold: ${threshold}`);
        const survivors = (0, newsIngestion_utils_1.dedupeSemantic)(embedded, recentPool, threshold);
        console.log(`\n3 candidates in -> ${survivors.length} survived semantic dedup:`);
        survivors.forEach((s) => console.log(`  - ${s.source_id}: "${s.title}"`));
        const survivedIds = new Set(survivors.map((s) => s.source_id));
        const gptDuplicateCollapsed = survivedIds.has('a-hn') !== survivedIds.has('b-devto');
        const higherEngagementKept = survivedIds.has('b-devto') && !survivedIds.has('a-hn');
        const distinctSurvived = survivedIds.has('c-reddit');
        console.log('\n--- Results ---');
        console.log(`[5.1] Near-duplicate pair (HN "a", Dev.to "b") collapsed to one: ${gptDuplicateCollapsed ? 'PASS' : 'FAIL'}`);
        console.log(`      Higher-engagement one (Dev.to, 300 points) kept over HN (50 points): ${higherEngagementKept ? 'PASS' : 'FAIL'}`);
        console.log(`[5.2] Distinct unrelated item (dotfiles CLI) survived untouched: ${distinctSurvived ? 'PASS' : 'FAIL'}`);
        return gptDuplicateCollapsed && higherEngagementKept && distinctSurvived ? 0 : 1;
    });
}
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        const args = process.argv.slice(2);
        const mode = args.includes('--calibrate') ? 'calibrate' : args.includes('--judge') ? 'judge' : 'default';
        // calibrate/judge work in memory against the embedding/LLM APIs only; default needs the DB pool.
        if (mode === 'default') {
            yield mongoose_1.default.connect(config_1.default.database_url);
        }
        let exitCode;
        try {
            if (mode === 'calibrate')
                exitCode = yield runCalibrate();
            else if (mode === 'judge')
                exitCode = yield runJudge();
            else
                exitCode = yield runDefault();
        }
        finally {
            if (mode === 'default')
                yield mongoose_1.default.disconnect();
        }
        process.exit(exitCode);
    });
}
main().catch((err) => {
    console.error(err);
    process.exit(1);
});
