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
exports.NewsItemController = void 0;
const AppError_1 = __importDefault(require("../../errors/AppError"));
const catchAsync_1 = require("../../utils/catchAsync");
const httpStatus_1 = require("../../utils/httpStatus");
const sendResponse_1 = __importDefault(require("../../utils/sendResponse"));
const newsItem_service_1 = require("./newsItem.service");
const createNewsItem = (0, catchAsync_1.catchAsync)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield newsItem_service_1.NewsItemService.createNewsItem(req.body);
    (0, sendResponse_1.default)(res, {
        statusCode: httpStatus_1.httpStatus.CREATED,
        success: true,
        message: 'News item created successfully',
        data: result,
    });
}));
const getAllNewsItems = (0, catchAsync_1.catchAsync)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { meta, result } = yield newsItem_service_1.NewsItemService.getAllNewsItems(req.query, req.user);
    (0, sendResponse_1.default)(res, {
        statusCode: httpStatus_1.httpStatus.OK,
        success: true,
        message: 'News items retrieved successfully',
        meta,
        data: result,
    });
}));
const getSingleNewsItem = (0, catchAsync_1.catchAsync)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield newsItem_service_1.NewsItemService.getSingleNewsItem(req.params.id, req.user);
    if (!result) {
        throw new AppError_1.default(httpStatus_1.httpStatus.NOT_FOUND, 'News item not found');
    }
    (0, sendResponse_1.default)(res, {
        statusCode: httpStatus_1.httpStatus.OK,
        success: true,
        message: 'News item retrieved successfully',
        data: result,
    });
}));
const updateNewsItem = (0, catchAsync_1.catchAsync)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield newsItem_service_1.NewsItemService.updateNewsItem(req.params.id, req.body);
    if (!result) {
        throw new AppError_1.default(httpStatus_1.httpStatus.NOT_FOUND, 'News item not found');
    }
    (0, sendResponse_1.default)(res, {
        statusCode: httpStatus_1.httpStatus.OK,
        success: true,
        message: 'News item updated successfully',
        data: result,
    });
}));
const deleteNewsItem = (0, catchAsync_1.catchAsync)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield newsItem_service_1.NewsItemService.deleteNewsItem(req.params.id);
    if (!result) {
        throw new AppError_1.default(httpStatus_1.httpStatus.NOT_FOUND, 'News item not found');
    }
    (0, sendResponse_1.default)(res, {
        statusCode: httpStatus_1.httpStatus.OK,
        success: true,
        message: 'News item deleted successfully',
        data: result,
    });
}));
exports.NewsItemController = {
    createNewsItem,
    getAllNewsItems,
    getSingleNewsItem,
    updateNewsItem,
    deleteNewsItem,
};
