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
// Workaround for a local Windows/Docker Desktop DNS quirk (see backend-scaffold
// tasks.md 7.2) where the resolver is pinned to 127.0.0.1 and SRV lookups for
// mongodb+srv:// fail with ECONNREFUSED. Harmless no-op on machines without it.
dns_1.default.setServers(['8.8.8.8', '1.1.1.1']);
const VECTOR_INDEXES = [
    { collection: 'news_items', indexName: 'news_items_vector_index' },
    { collection: 'brand_voice_examples', indexName: 'brand_voice_vector_index' },
    { collection: 'platform_posts', indexName: 'platform_posts_vector_index' },
];
const vectorSearchDefinition = {
    fields: [
        {
            type: 'vector',
            path: 'embedding',
            numDimensions: 1536,
            similarity: 'cosine',
        },
    ],
};
const createVectorIndexes = () => __awaiter(void 0, void 0, void 0, function* () {
    yield mongoose_1.default.connect(config_1.default.database_url);
    const db = mongoose_1.default.connection.db;
    if (!db)
        throw new Error('Mongoose connection not established');
    for (const { collection, indexName } of VECTOR_INDEXES) {
        // listSearchIndexes/createSearchIndex require the collection namespace to
        // already exist — Atlas won't lazily create it the way normal writes do.
        yield db.createCollection(collection).catch((err) => {
            if (err instanceof Error && err.message.includes('already exists'))
                return;
            throw err;
        });
        const coll = db.collection(collection);
        const existing = yield coll.listSearchIndexes(indexName).toArray().catch(() => []);
        if (existing.length > 0) {
            console.log(`[createVectorIndexes] ${collection}.${indexName}: already exists, skipping`);
            continue;
        }
        yield coll.createSearchIndex({
            name: indexName,
            type: 'vectorSearch',
            definition: vectorSearchDefinition,
        });
        console.log(`[createVectorIndexes] ${collection}.${indexName}: created`);
    }
    yield mongoose_1.default.disconnect();
});
createVectorIndexes()
    .then(() => {
    console.log('[createVectorIndexes] done');
    process.exit(0);
})
    .catch((err) => {
    console.error('[createVectorIndexes] failed:', err instanceof Error ? err.message : err);
    process.exit(1);
});
