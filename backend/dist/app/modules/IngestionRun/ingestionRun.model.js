"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IngestionRun = void 0;
const mongoose_1 = require("mongoose");
const sourceRunCountSchema = new mongoose_1.Schema({
    source: { type: String, required: true },
    fetched: { type: Number, required: true, default: 0 },
    fresh_dropped: { type: Number, required: true, default: 0 },
    hash_deduped: { type: Number, required: true, default: 0 },
    semantic_deduped: { type: Number, required: true, default: 0 },
    relevance_dropped: { type: Number, required: true, default: 0 },
    stored: { type: Number, required: true, default: 0 },
    error: { type: String },
    content_fetched: { type: Number },
    content_failed: { type: Number },
}, { _id: false });
const ingestionRunSchema = new mongoose_1.Schema({
    started_at: { type: Date, required: true },
    finished_at: { type: Date, required: true },
    duration_ms: { type: Number, required: true },
    trigger: { type: String, enum: ['cron', 'manual'], required: true },
    total_stored: { type: Number, required: true, default: 0 },
    sources: { type: [sourceRunCountSchema], required: true, default: [] },
    error: { type: String },
});
// Self-cleaning operational history — see design.md decision 5 (30 days comfortably
// covers the default zero-streak lookback window with headroom for manual debugging).
ingestionRunSchema.index({ started_at: 1 }, { expireAfterSeconds: 2592000 });
exports.IngestionRun = (0, mongoose_1.model)('IngestionRun', ingestionRunSchema, 'ingestion_runs');
