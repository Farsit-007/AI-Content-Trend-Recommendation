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
exports.NewsItemCategoryOverrideService = void 0;
const AppError_1 = __importDefault(require("../../errors/AppError"));
const httpStatus_1 = require("../../utils/httpStatus");
const newsItem_model_1 = require("../NewsItem/newsItem.model");
const team_service_1 = require("../Team/team.service");
const newsItemCategoryOverride_model_1 = require("./newsItemCategoryOverride.model");
const assertTeamAccess = (teamId, requestingUser) => {
    if (requestingUser.role === 'admin' || requestingUser.role === 'super_admin')
        return;
    if (!requestingUser.team_ids.includes(teamId)) {
        throw new AppError_1.default(httpStatus_1.httpStatus.FORBIDDEN, 'You do not have access to this team');
    }
};
const setOverride = (newsItemId, teamId, payload, requestingUser) => __awaiter(void 0, void 0, void 0, function* () {
    assertTeamAccess(teamId, requestingUser);
    const newsItem = yield newsItem_model_1.NewsItem.findById(newsItemId);
    if (!newsItem) {
        throw new AppError_1.default(httpStatus_1.httpStatus.NOT_FOUND, 'News item not found');
    }
    if (payload.category !== undefined) {
        const effectiveCategories = yield team_service_1.TeamService.getEffectiveCategories(teamId);
        if (!effectiveCategories.some((c) => c.toLowerCase() === payload.category.toLowerCase())) {
            throw new AppError_1.default(httpStatus_1.httpStatus.BAD_REQUEST, 'category must be one of the team\'s effective categories');
        }
    }
    const result = yield newsItemCategoryOverride_model_1.NewsItemCategoryOverride.findOneAndUpdate({ news_item_id: newsItemId, team_id: teamId }, {
        $set: Object.assign(Object.assign(Object.assign({}, (payload.category !== undefined ? { category: payload.category } : {})), (payload.opportunity_score !== undefined ? { opportunity_score: payload.opportunity_score } : {})), { overridden_by: requestingUser.id, overridden_at: new Date() }),
    }, { new: true, upsert: true, setDefaultsOnInsert: true });
    return result;
});
const clearOverride = (newsItemId, teamId, requestingUser) => __awaiter(void 0, void 0, void 0, function* () {
    assertTeamAccess(teamId, requestingUser);
    const result = yield newsItemCategoryOverride_model_1.NewsItemCategoryOverride.findOneAndDelete({ news_item_id: newsItemId, team_id: teamId });
    if (!result) {
        throw new AppError_1.default(httpStatus_1.httpStatus.NOT_FOUND, 'No override exists for this team on this news item');
    }
    return result;
});
/** Batch-fetch overrides for a set of news items across all of a user's teams, keyed by news_item_id. */
const fetchOverridesForItems = (newsItemIds, teamIds) => __awaiter(void 0, void 0, void 0, function* () {
    if (newsItemIds.length === 0 || teamIds.length === 0)
        return new Map();
    const overrides = yield newsItemCategoryOverride_model_1.NewsItemCategoryOverride.find({
        news_item_id: { $in: newsItemIds },
        team_id: { $in: teamIds },
    });
    // A news item could theoretically have overrides from multiple of the user's teams;
    // first match wins since a single response can only show one effective view per item.
    const byItem = new Map();
    for (const override of overrides) {
        if (!byItem.has(override.news_item_id)) {
            byItem.set(override.news_item_id, override);
        }
    }
    return byItem;
});
exports.NewsItemCategoryOverrideService = {
    setOverride,
    clearOverride,
    fetchOverridesForItems,
};
