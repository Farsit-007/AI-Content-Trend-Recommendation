"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NewsDedupLedger = void 0;
const mongoose_1 = require("mongoose");
const config_1 = __importDefault(require("../../config"));
const newsDedupLedgerSchema = new mongoose_1.Schema({
    content_hash: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    source: { type: String, required: true },
    deleted_at: { type: Date, default: Date.now },
});
// TTL computed from config (not a hardcoded literal like IngestionRun/MaintenanceRun) since
// NEWS_DEDUP_LEDGER_TTL_DAYS is operator-configurable (design.md decision 2). Changing the env
// var after this index has already been created in a deployed MongoDB does not retroactively
// update it — that requires a manual collMod.
newsDedupLedgerSchema.index({ deleted_at: 1 }, { expireAfterSeconds: config_1.default.news_ingestion.dedup_ledger_ttl_days * 86400 });
exports.NewsDedupLedger = (0, mongoose_1.model)('NewsDedupLedger', newsDedupLedgerSchema, 'news_dedup_ledger');
