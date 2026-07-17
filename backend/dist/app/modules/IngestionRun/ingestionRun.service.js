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
Object.defineProperty(exports, "__esModule", { value: true });
exports.IngestionRunService = exports.computeZeroStreaks = void 0;
const ingestionRun_model_1 = require("./ingestionRun.model");
const MAX_LIMIT = 100;
const ZERO_STREAK_ALERT_THRESHOLD = 3;
const listRuns = (limit) => __awaiter(void 0, void 0, void 0, function* () {
    const bounded = Math.min(Math.max(limit, 1), MAX_LIMIT);
    return ingestionRun_model_1.IngestionRun.find().sort({ started_at: -1 }).limit(bounded);
});
/**
 * Walks `runs` (already newest-first) once per distinct source, counting a leading streak of
 * `fetched === 0` from the most recent run backward. A source absent from a run's `sources` array
 * counts as `fetched: 0` for that run — an adapter that isn't even attempting to fetch is exactly
 * as dead as one that tried and got nothing.
 */
const computeZeroStreaks = (runs) => {
    const sources = new Set();
    for (const run of runs) {
        for (const s of run.sources)
            sources.add(s.source);
    }
    return Array.from(sources).map((source) => {
        var _a, _b;
        let zero_streak = 0;
        for (const run of runs) {
            const fetched = (_b = (_a = run.sources.find((s) => s.source === source)) === null || _a === void 0 ? void 0 : _a.fetched) !== null && _b !== void 0 ? _b : 0;
            if (fetched > 0)
                break;
            zero_streak += 1;
        }
        return { source, zero_streak, alert: zero_streak >= ZERO_STREAK_ALERT_THRESHOLD };
    });
};
exports.computeZeroStreaks = computeZeroStreaks;
exports.IngestionRunService = {
    listRuns,
    computeZeroStreaks: exports.computeZeroStreaks,
};
