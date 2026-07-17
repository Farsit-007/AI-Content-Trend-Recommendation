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
exports.PlatformPostService = void 0;
const QueryBuilder_1 = __importDefault(require("../../builder/QueryBuilder"));
const AppError_1 = __importDefault(require("../../errors/AppError"));
const embeddings_1 = require("../../lib/embeddings");
const httpStatus_1 = require("../../utils/httpStatus");
const platformPost_model_1 = require("./platformPost.model");
const platformPost_utils_1 = require("./platformPost.utils");
const assertTeamAccess = (teamId, requestingUser) => {
    if (requestingUser.role === 'admin')
        return;
    if (!requestingUser.team_ids.includes(teamId)) {
        throw new AppError_1.default(httpStatus_1.httpStatus.FORBIDDEN, 'You do not have access to this team');
    }
};
const createPlatformPost = (payload, requestingUser) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    assertTeamAccess(payload.team_id, requestingUser);
    const embedding = (_a = payload.embedding) !== null && _a !== void 0 ? _a : (yield (0, embeddings_1.embed)((_b = payload.content_snippet) !== null && _b !== void 0 ? _b : `${payload.platform} ${payload.post_id}`));
    const result = yield platformPost_model_1.PlatformPost.create(Object.assign(Object.assign({}, payload), { embedding }));
    return result;
});
const getAllPlatformPosts = (query, requestingUser) => __awaiter(void 0, void 0, void 0, function* () {
    const platformPostQuery = new QueryBuilder_1.default(platformPost_model_1.PlatformPost.find(), query)
        .search(platformPost_utils_1.platformPostSearchableFields)
        .filter()
        .sort()
        .paginate();
    if (requestingUser.role !== 'admin') {
        platformPostQuery.modelQuery = platformPostQuery.modelQuery.find({
            team_id: { $in: requestingUser.team_ids },
        });
    }
    const result = yield platformPostQuery.modelQuery;
    const meta = yield platformPostQuery.countTotal();
    return { meta, result };
});
const getSinglePlatformPost = (id, requestingUser) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield platformPost_model_1.PlatformPost.findById(id);
    if (!result)
        return null;
    // Pretend it doesn't exist for a team the caller can't see — don't confirm existence.
    if (requestingUser.role !== 'admin' && !requestingUser.team_ids.includes(result.team_id)) {
        return null;
    }
    return result;
});
const updatePlatformPost = (id, payload, requestingUser) => __awaiter(void 0, void 0, void 0, function* () {
    const existing = yield getSinglePlatformPost(id, requestingUser);
    if (!existing)
        return null;
    const result = yield platformPost_model_1.PlatformPost.findByIdAndUpdate(id, payload, {
        new: true,
        runValidators: true,
    });
    return result;
});
const deletePlatformPost = (id, requestingUser) => __awaiter(void 0, void 0, void 0, function* () {
    const existing = yield getSinglePlatformPost(id, requestingUser);
    if (!existing)
        return null;
    const result = yield platformPost_model_1.PlatformPost.findByIdAndDelete(id);
    return result;
});
exports.PlatformPostService = {
    createPlatformPost,
    getAllPlatformPosts,
    getSinglePlatformPost,
    updatePlatformPost,
    deletePlatformPost,
};
