"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MaintenanceRun = void 0;
const mongoose_1 = require("mongoose");
const maintenanceRunSchema = new mongoose_1.Schema({
    job: { type: String, enum: ['engagement_refresh', 'retention'], required: true },
    started_at: { type: Date, required: true },
    finished_at: { type: Date, required: true },
    duration_ms: { type: Number, required: true },
    // Mixed, not a rigid sub-schema: engagement_refresh and retention runs have structurally
    // different counts shapes (design.md decision 8). Each job's service function is the single
    // typed writer for its own shape (IEngagementRefreshCounts | IRetentionCounts at the TS layer);
    // existing engagement_refresh reads/writes are unaffected — Mixed stores that shape unchanged.
    counts: { type: mongoose_1.Schema.Types.Mixed, required: true },
    error: { type: String },
});
// Self-cleaning operational history, mirroring IngestionRun's TTL discipline
// (see design.md decision 5 — a sibling collection rather than overloading ingestion_runs).
maintenanceRunSchema.index({ started_at: 1 }, { expireAfterSeconds: 2592000 });
exports.MaintenanceRun = (0, mongoose_1.model)('MaintenanceRun', maintenanceRunSchema, 'maintenance_runs');
