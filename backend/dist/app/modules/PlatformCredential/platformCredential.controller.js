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
exports.PlatformCredentialController = void 0;
const catchAsync_1 = require("../../utils/catchAsync");
const httpStatus_1 = require("../../utils/httpStatus");
const sendResponse_1 = __importDefault(require("../../utils/sendResponse"));
const platformCredential_service_1 = require("./platformCredential.service");
const upsertCredential = (0, catchAsync_1.catchAsync)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield platformCredential_service_1.PlatformCredentialService.upsertCredential(req.params.teamId, req.body, req.user.id);
    (0, sendResponse_1.default)(res, {
        statusCode: httpStatus_1.httpStatus.CREATED,
        success: true,
        message: 'Platform credential saved successfully',
        data: result,
    });
}));
const listCredentials = (0, catchAsync_1.catchAsync)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield platformCredential_service_1.PlatformCredentialService.listCredentials(req.params.teamId);
    (0, sendResponse_1.default)(res, {
        statusCode: httpStatus_1.httpStatus.OK,
        success: true,
        message: 'Platform credentials retrieved successfully',
        data: result,
    });
}));
const revealCredential = (0, catchAsync_1.catchAsync)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield platformCredential_service_1.PlatformCredentialService.revealCredential(req.params.teamId, req.params.platform);
    (0, sendResponse_1.default)(res, {
        statusCode: httpStatus_1.httpStatus.OK,
        success: true,
        message: 'Platform credential revealed successfully',
        data: result,
    });
}));
const deleteCredential = (0, catchAsync_1.catchAsync)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield platformCredential_service_1.PlatformCredentialService.deleteCredential(req.params.teamId, req.params.platform);
    (0, sendResponse_1.default)(res, {
        statusCode: httpStatus_1.httpStatus.OK,
        success: true,
        message: 'Platform credential deleted successfully',
        data: result,
    });
}));
exports.PlatformCredentialController = {
    upsertCredential,
    listCredentials,
    revealCredential,
    deleteCredential,
};
