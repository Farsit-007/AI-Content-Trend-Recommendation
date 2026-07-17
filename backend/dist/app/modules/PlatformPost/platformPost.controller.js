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
exports.PlatformPostController = void 0;
const AppError_1 = __importDefault(require("../../errors/AppError"));
const catchAsync_1 = require("../../utils/catchAsync");
const httpStatus_1 = require("../../utils/httpStatus");
const sendResponse_1 = __importDefault(require("../../utils/sendResponse"));
const platformPost_service_1 = require("./platformPost.service");
const createPlatformPost = (0, catchAsync_1.catchAsync)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield platformPost_service_1.PlatformPostService.createPlatformPost(req.body, req.user);
    (0, sendResponse_1.default)(res, {
        statusCode: httpStatus_1.httpStatus.CREATED,
        success: true,
        message: 'Platform post created successfully',
        data: result,
    });
}));
const getAllPlatformPosts = (0, catchAsync_1.catchAsync)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { meta, result } = yield platformPost_service_1.PlatformPostService.getAllPlatformPosts(req.query, req.user);
    (0, sendResponse_1.default)(res, {
        statusCode: httpStatus_1.httpStatus.OK,
        success: true,
        message: 'Platform posts retrieved successfully',
        meta,
        data: result,
    });
}));
const getSinglePlatformPost = (0, catchAsync_1.catchAsync)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield platformPost_service_1.PlatformPostService.getSinglePlatformPost(req.params.id, req.user);
    if (!result) {
        throw new AppError_1.default(httpStatus_1.httpStatus.NOT_FOUND, 'Platform post not found');
    }
    (0, sendResponse_1.default)(res, {
        statusCode: httpStatus_1.httpStatus.OK,
        success: true,
        message: 'Platform post retrieved successfully',
        data: result,
    });
}));
const updatePlatformPost = (0, catchAsync_1.catchAsync)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield platformPost_service_1.PlatformPostService.updatePlatformPost(req.params.id, req.body, req.user);
    if (!result) {
        throw new AppError_1.default(httpStatus_1.httpStatus.NOT_FOUND, 'Platform post not found');
    }
    (0, sendResponse_1.default)(res, {
        statusCode: httpStatus_1.httpStatus.OK,
        success: true,
        message: 'Platform post updated successfully',
        data: result,
    });
}));
const deletePlatformPost = (0, catchAsync_1.catchAsync)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield platformPost_service_1.PlatformPostService.deletePlatformPost(req.params.id, req.user);
    if (!result) {
        throw new AppError_1.default(httpStatus_1.httpStatus.NOT_FOUND, 'Platform post not found');
    }
    (0, sendResponse_1.default)(res, {
        statusCode: httpStatus_1.httpStatus.OK,
        success: true,
        message: 'Platform post deleted successfully',
        data: result,
    });
}));
exports.PlatformPostController = {
    createPlatformPost,
    getAllPlatformPosts,
    getSinglePlatformPost,
    updatePlatformPost,
    deletePlatformPost,
};
