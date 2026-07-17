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
const embeddings_1 = require("../app/lib/embeddings");
const newsItem_model_1 = require("../app/modules/NewsItem/newsItem.model");
const brandVoiceExample_model_1 = require("../app/modules/BrandVoiceExample/brandVoiceExample.model");
const platformPost_model_1 = require("../app/modules/PlatformPost/platformPost.model");
// Same local DNS workaround as createVectorIndexes.ts — see backend-scaffold
// tasks.md 7.2. Harmless no-op on machines without the quirk.
dns_1.default.setServers(['8.8.8.8', '1.1.1.1']);
const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 60000;
const waitUntilReady = (collectionName, indexName) => __awaiter(void 0, void 0, void 0, function* () {
    const db = mongoose_1.default.connection.db;
    if (!db)
        throw new Error('Mongoose connection not established');
    const coll = db.collection(collectionName);
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    while (Date.now() < deadline) {
        const [index] = (yield coll.listSearchIndexes(indexName).toArray());
        if (index === null || index === void 0 ? void 0 : index.queryable)
            return;
        yield new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
    throw new Error(`index ${indexName} did not become queryable within ${POLL_TIMEOUT_MS}ms`);
});
const verifyTargets = (vector) => __awaiter(void 0, void 0, void 0, function* () {
    return [
        {
            label: 'news_items',
            collectionName: 'news_items',
            indexName: 'news_items_vector_index',
            seed: () => __awaiter(void 0, void 0, void 0, function* () {
                const doc = yield newsItem_model_1.NewsItem.create({
                    source: '__verify__',
                    source_id: `verify-${Date.now()}`,
                    content_hash: `verify-${Date.now()}-${Math.random()}`,
                    title: '__verify__',
                    url: 'https://example.com/verify',
                    embedding: vector,
                });
                return { id: doc._id, cleanup: () => __awaiter(void 0, void 0, void 0, function* () { return newsItem_model_1.NewsItem.deleteOne({ _id: doc._id }).exec().then(() => undefined); }) };
            }),
        },
        {
            label: 'brand_voice_examples',
            collectionName: 'brand_voice_examples',
            indexName: 'brand_voice_vector_index',
            seed: () => __awaiter(void 0, void 0, void 0, function* () {
                const doc = yield brandVoiceExample_model_1.BrandVoiceExample.create({
                    platform: '__verify__',
                    content: '__verify__',
                    embedding: vector,
                });
                return {
                    id: doc._id,
                    cleanup: () => __awaiter(void 0, void 0, void 0, function* () { return brandVoiceExample_model_1.BrandVoiceExample.deleteOne({ _id: doc._id }).exec().then(() => undefined); }),
                };
            }),
        },
        {
            label: 'platform_posts',
            collectionName: 'platform_posts',
            indexName: 'platform_posts_vector_index',
            seed: () => __awaiter(void 0, void 0, void 0, function* () {
                const doc = yield platformPost_model_1.PlatformPost.create({
                    platform: '__verify__',
                    post_id: `verify-${Date.now()}`,
                    embedding: vector,
                    metrics: { reach: 0, likes: 0, comments: 0, shares: 0, views: 0 },
                });
                return {
                    id: doc._id,
                    cleanup: () => __awaiter(void 0, void 0, void 0, function* () { return platformPost_model_1.PlatformPost.deleteOne({ _id: doc._id }).exec().then(() => undefined); }),
                };
            }),
        },
    ];
});
const runVectorSearch = (collectionName, indexName, vector) => __awaiter(void 0, void 0, void 0, function* () {
    const db = mongoose_1.default.connection.db;
    if (!db)
        throw new Error('Mongoose connection not established');
    const results = yield db
        .collection(collectionName)
        .aggregate([
        {
            $vectorSearch: {
                index: indexName,
                path: 'embedding',
                queryVector: vector,
                numCandidates: 20,
                limit: 5,
            },
        },
        { $project: { _id: 1 } },
    ])
        .toArray();
    return results.length;
});
// Atlas Search/Vector indexes are near-real-time, not synchronous — a
// freshly-inserted document can take a few seconds to become searchable even
// though the index itself already reports queryable: true. Retry the query
// rather than treating one empty result as a hard failure.
const runVectorSearchWithRetry = (collectionName, indexName, vector) => __awaiter(void 0, void 0, void 0, function* () {
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    let lastCount = 0;
    while (Date.now() < deadline) {
        lastCount = yield runVectorSearch(collectionName, indexName, vector);
        if (lastCount > 0)
            return lastCount;
        yield new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
    return lastCount;
});
const verifyVectorIndexes = () => __awaiter(void 0, void 0, void 0, function* () {
    yield mongoose_1.default.connect(config_1.default.database_url);
    const vector = yield (0, embeddings_1.embed)('growth studio vector index verification probe');
    const targets = yield verifyTargets(vector);
    const results = [];
    for (const target of targets) {
        let cleanup;
        try {
            yield waitUntilReady(target.collectionName, target.indexName);
            const seeded = yield target.seed();
            cleanup = seeded.cleanup;
            const matchCount = yield runVectorSearchWithRetry(target.collectionName, target.indexName, vector);
            if (matchCount > 0) {
                results.push({ label: target.label, pass: true, detail: `${matchCount} result(s) returned` });
            }
            else {
                results.push({ label: target.label, pass: false, detail: 'query succeeded but returned zero results' });
            }
        }
        catch (err) {
            results.push({
                label: target.label,
                pass: false,
                detail: err instanceof Error ? err.message : String(err),
            });
        }
        finally {
            if (cleanup)
                yield cleanup();
        }
    }
    yield mongoose_1.default.disconnect();
    for (const result of results) {
        const status = result.pass ? 'PASS' : 'FAIL';
        console.log(`[verifyVectorIndexes] ${result.label}: ${status} — ${result.detail}`);
    }
    if (results.some((r) => !r.pass)) {
        throw new Error('one or more vector index verifications failed');
    }
});
verifyVectorIndexes()
    .then(() => {
    console.log('[verifyVectorIndexes] all indexes verified');
    process.exit(0);
})
    .catch((err) => {
    console.error('[verifyVectorIndexes] failed:', err instanceof Error ? err.message : err);
    process.exit(1);
});
