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
exports.BrandVoiceExampleService = void 0;
const QueryBuilder_1 = __importDefault(require("../../builder/QueryBuilder"));
const AppError_1 = __importDefault(require("../../errors/AppError"));
const embeddings_1 = require("../../lib/embeddings");
const httpStatus_1 = require("../../utils/httpStatus");
const brandVoiceExample_model_1 = require("./brandVoiceExample.model");
const brandVoiceExample_utils_1 = require("./brandVoiceExample.utils");
const assertTeamAccess = (teamId, requestingUser) => {
    if (requestingUser.role === 'admin')
        return;
    if (!requestingUser.team_ids.includes(teamId)) {
        throw new AppError_1.default(httpStatus_1.httpStatus.FORBIDDEN, 'You do not have access to this team');
    }
};
const createBrandVoiceExample = (payload, requestingUser) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    assertTeamAccess(payload.team_id, requestingUser);
    const embedding = (_a = payload.embedding) !== null && _a !== void 0 ? _a : (yield (0, embeddings_1.embed)(payload.content));
    const result = yield brandVoiceExample_model_1.BrandVoiceExample.create(Object.assign(Object.assign({}, payload), { embedding }));
    return result;
});
const getAllBrandVoiceExamples = (query, requestingUser) => __awaiter(void 0, void 0, void 0, function* () {
    const brandVoiceExampleQuery = new QueryBuilder_1.default(brandVoiceExample_model_1.BrandVoiceExample.find(), query)
        .search(brandVoiceExample_utils_1.brandVoiceExampleSearchableFields)
        .filter()
        .sort()
        .paginate();
    if (requestingUser.role !== 'admin') {
        brandVoiceExampleQuery.modelQuery = brandVoiceExampleQuery.modelQuery.find({
            team_id: { $in: requestingUser.team_ids },
        });
    }
    const result = yield brandVoiceExampleQuery.modelQuery;
    const meta = yield brandVoiceExampleQuery.countTotal();
    return { meta, result };
});
const getSingleBrandVoiceExample = (id, requestingUser) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield brandVoiceExample_model_1.BrandVoiceExample.findById(id);
    if (!result)
        return null;
    if (requestingUser.role !== 'admin' && !requestingUser.team_ids.includes(result.team_id)) {
        return null;
    }
    return result;
});
const updateBrandVoiceExample = (id, payload, requestingUser) => __awaiter(void 0, void 0, void 0, function* () {
    const existing = yield getSingleBrandVoiceExample(id, requestingUser);
    if (!existing)
        return null;
    const result = yield brandVoiceExample_model_1.BrandVoiceExample.findByIdAndUpdate(id, payload, {
        new: true,
        runValidators: true,
    });
    return result;
});
const deleteBrandVoiceExample = (id, requestingUser) => __awaiter(void 0, void 0, void 0, function* () {
    const existing = yield getSingleBrandVoiceExample(id, requestingUser);
    if (!existing)
        return null;
    const result = yield brandVoiceExample_model_1.BrandVoiceExample.findByIdAndDelete(id);
    return result;
});
exports.BrandVoiceExampleService = {
    createBrandVoiceExample,
    getAllBrandVoiceExamples,
    getSingleBrandVoiceExample,
    updateBrandVoiceExample,
    deleteBrandVoiceExample,
};
