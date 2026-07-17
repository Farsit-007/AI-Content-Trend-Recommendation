import { Schema, model } from 'mongoose';
import config from '../../config';
import { INewsDedupLedger } from './newsDedupLedger.interface';

const newsDedupLedgerSchema = new Schema<INewsDedupLedger>({
  content_hash: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  source: { type: String, required: true },
  deleted_at: { type: Date, default: Date.now },
});

// TTL computed from config (not a hardcoded literal like IngestionRun/MaintenanceRun) since
// NEWS_DEDUP_LEDGER_TTL_DAYS is operator-configurable (design.md decision 2). Changing the env
// var after this index has already been created in a deployed MongoDB does not retroactively
// update it — that requires a manual collMod.
newsDedupLedgerSchema.index({ deleted_at: 1 }, { expireAfterSeconds: config.news_ingestion.dedup_ledger_ttl_days * 86400 });

export const NewsDedupLedger = model<INewsDedupLedger>('NewsDedupLedger', newsDedupLedgerSchema, 'news_dedup_ledger');
