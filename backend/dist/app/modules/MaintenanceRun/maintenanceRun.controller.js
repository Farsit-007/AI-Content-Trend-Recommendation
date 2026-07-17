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
exports.MaintenanceRunController = void 0;
const catchAsync_1 = require("../../utils/catchAsync");
const httpStatus_1 = require("../../utils/httpStatus");
const sendResponse_1 = __importDefault(require("../../utils/sendResponse"));
const maintenanceRun_service_1 = require("./maintenanceRun.service");
const DEFAULT_LIMIT = 20;
const VALID_JOBS = ['engagement_refresh', 'retention'];
const listRuns = (0, catchAsync_1.catchAsync)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const limit = req.query.limit ? Number(req.query.limit) : DEFAULT_LIMIT;
    const jobParam = req.query.job;
    const job = VALID_JOBS.includes(jobParam)
        ? jobParam
        : undefined;
    const runs = yield maintenanceRun_service_1.MaintenanceRunService.listRuns(Number.isFinite(limit) ? limit : DEFAULT_LIMIT, job);
    (0, sendResponse_1.default)(res, {
        statusCode: httpStatus_1.httpStatus.OK,
        success: true,
        message: 'Maintenance run history retrieved successfully',
        data: { runs },
    });
}));
exports.MaintenanceRunController = {
    listRuns,
};
