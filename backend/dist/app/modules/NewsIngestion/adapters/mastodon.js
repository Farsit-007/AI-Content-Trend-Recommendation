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
exports.fetchMastodon = void 0;
const config_1 = __importDefault(require("../../../config"));
const logger_1 = require("../../../lib/logger");
const htmlText_1 = require("./htmlText");
const fetchInstanceTrends = (instance) => __awaiter(void 0, void 0, void 0, function* () {
    const res = yield fetch(`https://${instance}/api/v1/trends/links`, {
        headers: { 'User-Agent': 'GrowthStudioBot/1.0' },
    });
    if (!res.ok)
        throw new Error(`Mastodon request failed for ${instance}: ${res.status}`);
    return (yield res.json());
});
const sharerCount = (link) => { var _a, _b, _c; return Number((_c = (_b = (_a = link.history) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.accounts) !== null && _c !== void 0 ? _c : 0); };
const fetchMastodon = () => __awaiter(void 0, void 0, void 0, function* () {
    const { mastodon_instances } = config_1.default.news_ingestion;
    if (mastodon_instances.length === 0) {
        const message = 'mastodon not configured (NEWS_INGESTION_MASTODON_INSTANCES is empty)';
        logger_1.logger.warn(`[NewsIngestion] ${message} — skipping`);
        throw new Error(message);
    }
    const results = yield Promise.allSettled(mastodon_instances.map((instance) => fetchInstanceTrends(instance)));
    const merged = new Map();
    for (const result of results) {
        if (result.status !== 'fulfilled')
            continue;
        for (const link of result.value) {
            const existing = merged.get(link.url);
            if (!existing || sharerCount(link) > sharerCount(existing))
                merged.set(link.url, link);
        }
    }
    const items = Array.from(merged.values()).map((link) => ({
        source: 'mastodon',
        source_id: link.url,
        title: link.title,
        url: link.url,
        snippet: link.description ? (0, htmlText_1.stripHtml)(link.description) : undefined,
        published_at: new Date(),
        raw_points: sharerCount(link),
        raw_comments: 0,
        raw_stars_delta: 0,
    }));
    const failures = results
        .map((result, i) => { var _a, _b; return (result.status === 'rejected' ? `${mastodon_instances[i]}: ${(_b = (_a = result.reason) === null || _a === void 0 ? void 0 : _a.message) !== null && _b !== void 0 ? _b : result.reason}` : null); })
        .filter((reason) => reason !== null);
    if (items.length === 0 && failures.length > 0) {
        throw new Error(`Mastodon: all instances failed (${failures.join('; ')})`);
    }
    for (const reason of failures) {
        logger_1.logger.error(`[NewsIngestion] Mastodon instance failed: ${reason}`);
    }
    return items;
});
exports.fetchMastodon = fetchMastodon;
