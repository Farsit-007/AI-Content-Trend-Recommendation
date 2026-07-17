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
exports.getReport = void 0;
const config_1 = __importDefault(require("../../config"));
const AppError_1 = __importDefault(require("../../errors/AppError"));
const redis_1 = require("../../lib/redis");
const httpStatus_1 = require("../../utils/httpStatus");
const report_aggregate_1 = require("./report.aggregate");
const report_opportunities_1 = require("./report.opportunities");
const report_prompt_1 = require("./report.prompt");
const assertTeamAccess = (teamId, requestingUser) => {
    if (requestingUser.role === 'admin' || requestingUser.role === 'super_admin')
        return;
    if (!requestingUser.team_ids.includes(teamId)) {
        throw new AppError_1.default(httpStatus_1.httpStatus.FORBIDDEN, 'You do not have access to this team');
    }
};
const buildReport = (teamId) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const [overview, platforms, opportunities] = yield Promise.all([
        (0, report_aggregate_1.aggregateOverview)(teamId),
        (0, report_aggregate_1.aggregatePlatformBreakdowns)(teamId),
        (0, report_opportunities_1.getTopOpportunities)(teamId),
    ]);
    const ai_insight = yield (0, report_prompt_1.generateBanglishInsight)({
        overview,
        platforms,
        topOpportunity: (_a = opportunities[0]) !== null && _a !== void 0 ? _a : null,
    });
    return { team_id: teamId, overview, platforms, opportunities, ai_insight, generated_at: new Date() };
});
const getReport = (teamId_1, requestingUser_1, ...args_1) => __awaiter(void 0, [teamId_1, requestingUser_1, ...args_1], void 0, function* (teamId, requestingUser, forceRefresh = false) {
    assertTeamAccess(teamId, requestingUser);
    const cacheKey = `report:${teamId}`;
    if (!forceRefresh) {
        const cached = yield redis_1.redis.get(cacheKey);
        if (cached) {
            return JSON.parse(cached);
        }
    }
    const report = yield buildReport(teamId);
    yield redis_1.redis.setex(cacheKey, config_1.default.analytics.report_cache_ttl, JSON.stringify(report));
    return report;
});
exports.getReport = getReport;
