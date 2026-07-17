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
exports.BrandVoiceExampleController = void 0;
const AppError_1 = __importDefault(require("../../errors/AppError"));
const catchAsync_1 = require("../../utils/catchAsync");
const httpStatus_1 = require("../../utils/httpStatus");
const sendResponse_1 = __importDefault(require("../../utils/sendResponse"));
const brandVoiceExample_service_1 = require("./brandVoiceExample.service");
const createBrandVoiceExample = (0, catchAsync_1.catchAsync)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield brandVoiceExample_service_1.BrandVoiceExampleService.createBrandVoiceExample(req.body, req.user);
    (0, sendResponse_1.default)(res, {
        statusCode: httpStatus_1.httpStatus.CREATED,
        success: true,
        message: 'Brand voice example created successfully',
        data: result,
    });
}));
const getAllBrandVoiceExamples = (0, catchAsync_1.catchAsync)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { meta, result } = yield brandVoiceExample_service_1.BrandVoiceExampleService.getAllBrandVoiceExamples(req.query, req.user);
    (0, sendResponse_1.default)(res, {
        statusCode: httpStatus_1.httpStatus.OK,
        success: true,
        message: 'Brand voice examples retrieved successfully',
        meta,
        data: result,
    });
}));
const getSingleBrandVoiceExample = (0, catchAsync_1.catchAsync)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield brandVoiceExample_service_1.BrandVoiceExampleService.getSingleBrandVoiceExample(req.params.id, req.user);
    if (!result) {
        throw new AppError_1.default(httpStatus_1.httpStatus.NOT_FOUND, 'Brand voice example not found');
    }
    (0, sendResponse_1.default)(res, {
        statusCode: httpStatus_1.httpStatus.OK,
        success: true,
        message: 'Brand voice example retrieved successfully',
        data: result,
    });
}));
const updateBrandVoiceExample = (0, catchAsync_1.catchAsync)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield brandVoiceExample_service_1.BrandVoiceExampleService.updateBrandVoiceExample(req.params.id, req.body, req.user);
    if (!result) {
        throw new AppError_1.default(httpStatus_1.httpStatus.NOT_FOUND, 'Brand voice example not found');
    }
    (0, sendResponse_1.default)(res, {
        statusCode: httpStatus_1.httpStatus.OK,
        success: true,
        message: 'Brand voice example updated successfully',
        data: result,
    });
}));
const deleteBrandVoiceExample = (0, catchAsync_1.catchAsync)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield brandVoiceExample_service_1.BrandVoiceExampleService.deleteBrandVoiceExample(req.params.id, req.user);
    if (!result) {
        throw new AppError_1.default(httpStatus_1.httpStatus.NOT_FOUND, 'Brand voice example not found');
    }
    (0, sendResponse_1.default)(res, {
        statusCode: httpStatus_1.httpStatus.OK,
        success: true,
        message: 'Brand voice example deleted successfully',
        data: result,
    });
}));
exports.BrandVoiceExampleController = {
    createBrandVoiceExample,
    getAllBrandVoiceExamples,
    getSingleBrandVoiceExample,
    updateBrandVoiceExample,
    deleteBrandVoiceExample,
};
