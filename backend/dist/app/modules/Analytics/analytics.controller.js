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
exports.AnalyticsController = void 0;
const catchAsync_1 = require("../../utils/catchAsync");
const httpStatus_1 = require("../../utils/httpStatus");
const sendResponse_1 = __importDefault(require("../../utils/sendResponse"));
const analytics_service_1 = require("./analytics.service");
const refresh = (0, catchAsync_1.catchAsync)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const teamId = (_a = req.body) === null || _a === void 0 ? void 0 : _a.team_id;
    const summary = yield (0, analytics_service_1.runAnalyticsRefresh)(teamId ? { teamId } : undefined);
    (0, sendResponse_1.default)(res, {
        statusCode: httpStatus_1.httpStatus.OK,
        success: true,
        message: 'Analytics refresh complete',
        data: summary,
    });
}));
const getAnalytics = (0, catchAsync_1.catchAsync)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const teamId = req.query.team_id;
    const result = yield (0, analytics_service_1.getTeamAnalytics)(teamId);
    (0, sendResponse_1.default)(res, {
        statusCode: httpStatus_1.httpStatus.OK,
        success: true,
        message: 'Analytics retrieved successfully',
        data: result,
    });
}));
exports.AnalyticsController = {
    refresh,
    getAnalytics,
};
