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
exports.GeneratedContentService = void 0;
const AppError_1 = __importDefault(require("../../errors/AppError"));
const httpStatus_1 = require("../../utils/httpStatus");
const generatedContent_job_1 = require("./generatedContent.job");
const generatedContent_model_1 = require("./generatedContent.model");
const assertTeamAccess = (teamId, requestingUser) => {
    if (requestingUser.role === 'admin' || requestingUser.role === 'super_admin')
        return;
    if (!requestingUser.team_ids.includes(teamId)) {
        throw new AppError_1.default(httpStatus_1.httpStatus.FORBIDDEN, 'You do not have access to this team');
    }
};
const assertAdmin = (requestingUser) => {
    if (requestingUser.role !== 'admin' && requestingUser.role !== 'super_admin') {
        throw new AppError_1.default(httpStatus_1.httpStatus.FORBIDDEN, 'Admin access required');
    }
};
const listDrafts = (query, requestingUser) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    assertTeamAccess(query.team_id, requestingUser);
    const filter = { team_id: query.team_id };
    if (query.status)
        filter.status = query.status;
    if (query.source)
        filter.source = query.source;
    const page = Math.max(1, parseInt((_a = query.page) !== null && _a !== void 0 ? _a : '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt((_b = query.limit) !== null && _b !== void 0 ? _b : '20', 10)));
    const skip = (page - 1) * limit;
    const [result, total] = yield Promise.all([
        generatedContent_model_1.GeneratedContent.find(filter).sort({ created_at: -1 }).skip(skip).limit(limit),
        generatedContent_model_1.GeneratedContent.countDocuments(filter),
    ]);
    return { meta: { page, limit, total, totalPage: Math.ceil(total / limit) }, result };
});
const updateStatus = (id, status, requestingUser) => __awaiter(void 0, void 0, void 0, function* () {
    const doc = yield generatedContent_model_1.GeneratedContent.findById(id);
    if (!doc)
        throw new AppError_1.default(httpStatus_1.httpStatus.NOT_FOUND, 'Generated content not found');
    assertTeamAccess(doc.team_id, requestingUser);
    doc.status = status;
    yield doc.save();
    return doc;
});
const triggerRun = (teamId, requestingUser) => __awaiter(void 0, void 0, void 0, function* () {
    assertAdmin(requestingUser);
    return (0, generatedContent_job_1.runAutoGeneration)(teamId);
});
exports.GeneratedContentService = {
    listDrafts,
    updateStatus,
    triggerRun,
};
