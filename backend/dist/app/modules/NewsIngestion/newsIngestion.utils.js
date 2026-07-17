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
exports.dedupeSemantic = exports.fetchRecentEmbeddings = exports.embedItems = exports.dedupeAgainstStored = exports.filterFresh = exports.attachContentHash = exports.computeContentHash = void 0;
const crypto_1 = __importDefault(require("crypto"));
const embeddings_1 = require("../../lib/embeddings");
const similarity_1 = require("../../lib/similarity");
const newsItem_model_1 = require("../NewsItem/newsItem.model");
const EMBED_BATCH_SIZE = 20;
const computeContentHash = (source, url) => crypto_1.default.createHash('sha256').update(`${source}:${url}`).digest('hex');
exports.computeContentHash = computeContentHash;
const attachContentHash = (items) => items.map((item) => (Object.assign(Object.assign({}, item), { content_hash: (0, exports.computeContentHash)(item.source, item.url) })));
exports.attachContentHash = attachContentHash;
/** Items without a reliable `published_at` are treated as fresh rather than discarded. */
const filterFresh = (items, maxAgeHours) => {
    const cutoff = Date.now() - maxAgeHours * 60 * 60 * 1000;
    return items.filter((item) => !item.published_at || item.published_at.getTime() >= cutoff);
};
exports.filterFresh = filterFresh;
/**
 * Single batch query against already-stored hashes, plus an in-run Set so the
 * same URL surfacing from two different sources in one run only survives once.
 */
const dedupeAgainstStored = (items) => __awaiter(void 0, void 0, void 0, function* () {
    const hashes = items.map((item) => item.content_hash);
    const existing = yield newsItem_model_1.NewsItem.find({ content_hash: { $in: hashes } }, { content_hash: 1 });
    const existingHashes = new Set(existing.map((doc) => doc.content_hash));
    const seenInRun = new Set();
    const unique = [];
    for (const item of items) {
        if (existingHashes.has(item.content_hash) || seenInRun.has(item.content_hash))
            continue;
        seenInRun.add(item.content_hash);
        unique.push(item);
    }
    return unique;
});
exports.dedupeAgainstStored = dedupeAgainstStored;
/** Chunks items into `EMBED_BATCH_SIZE`-sized groups, one embeddings call per group (mirrors
 * `categorizeBatch`'s batching). Batches run one at a time rather than via `Promise.all` — a run
 * can produce hundreds of unique items, and firing every batch concurrently still floods
 * OpenRouter enough to trigger intermittent malformed responses under free-tier rate limits. */
const embedItems = (items) => __awaiter(void 0, void 0, void 0, function* () {
    const embedded = [];
    for (let i = 0; i < items.length; i += EMBED_BATCH_SIZE) {
        const batch = items.slice(i, i + EMBED_BATCH_SIZE);
        const vectors = yield (0, embeddings_1.embedBatch)(batch.map((item) => { var _a; return `${item.title} ${(_a = item.snippet) !== null && _a !== void 0 ? _a : ''}`.trim(); }));
        batch.forEach((item, j) => embedded.push(Object.assign(Object.assign({}, item), { embedding: vectors[j] })));
    }
    return embedded;
});
exports.embedItems = embedItems;
/** Single batch query per run, mirroring `fetchBrandVoicePool`'s pooling pattern. */
const fetchRecentEmbeddings = (cutoff) => __awaiter(void 0, void 0, void 0, function* () {
    const recent = yield newsItem_model_1.NewsItem.find({ published_at: { $gte: cutoff } }, { embedding: 1 });
    return recent.map((doc) => doc.embedding);
});
exports.fetchRecentEmbeddings = fetchRecentEmbeddings;
const engagementWeight = (item) => item.raw_points + item.raw_comments * 2 + item.raw_stars_delta * 3;
/**
 * Greedy pass: an item matching the recently-stored pool is always discarded
 * (something equivalent is already live). An item matching an already-accepted
 * in-run item is resolved by keeping whichever has higher raw engagement.
 */
const dedupeSemantic = (items, recentPool, threshold) => {
    const accepted = [];
    for (const item of items) {
        if (recentPool.length > 0 && Math.max(...recentPool.map((e) => (0, similarity_1.cosineSimilarity)(item.embedding, e))) >= threshold) {
            continue;
        }
        let bestMatch = -1;
        let bestSimilarity = 0;
        for (let i = 0; i < accepted.length; i++) {
            const similarity = (0, similarity_1.cosineSimilarity)(item.embedding, accepted[i].embedding);
            if (similarity >= threshold && similarity > bestSimilarity) {
                bestSimilarity = similarity;
                bestMatch = i;
            }
        }
        if (bestMatch === -1) {
            accepted.push(item);
        }
        else if (engagementWeight(item) > engagementWeight(accepted[bestMatch])) {
            accepted[bestMatch] = item;
        }
    }
    return accepted;
};
exports.dedupeSemantic = dedupeSemantic;
