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
exports.PlatformCatalogController = void 0;
const catchAsync_1 = require("../../utils/catchAsync");
const httpStatus_1 = require("../../utils/httpStatus");
const sendResponse_1 = __importDefault(require("../../utils/sendResponse"));
const platformCatalog_service_1 = require("./platformCatalog.service");
const createPlatform = (0, catchAsync_1.catchAsync)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield platformCatalog_service_1.PlatformCatalogService.createPlatform(req.body, req.user.id);
    (0, sendResponse_1.default)(res, {
        statusCode: httpStatus_1.httpStatus.CREATED,
        success: true,
        message: 'Platform added to the catalog successfully',
        data: result,
    });
}));
const listPlatforms = (0, catchAsync_1.catchAsync)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield platformCatalog_service_1.PlatformCatalogService.listPlatforms(req.user);
    (0, sendResponse_1.default)(res, {
        statusCode: httpStatus_1.httpStatus.OK,
        success: true,
        message: 'Platforms retrieved successfully',
        data: result,
    });
}));
const enablePlatform = (0, catchAsync_1.catchAsync)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield platformCatalog_service_1.PlatformCatalogService.setPlatformEnabled(req.params.name, true);
    (0, sendResponse_1.default)(res, {
        statusCode: httpStatus_1.httpStatus.OK,
        success: true,
        message: 'Platform enabled successfully',
        data: result,
    });
}));
const disablePlatform = (0, catchAsync_1.catchAsync)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield platformCatalog_service_1.PlatformCatalogService.setPlatformEnabled(req.params.name, false);
    (0, sendResponse_1.default)(res, {
        statusCode: httpStatus_1.httpStatus.OK,
        success: true,
        message: 'Platform disabled successfully',
        data: result,
    });
}));
const deletePlatform = (0, catchAsync_1.catchAsync)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield platformCatalog_service_1.PlatformCatalogService.deletePlatform(req.params.name);
    (0, sendResponse_1.default)(res, {
        statusCode: httpStatus_1.httpStatus.OK,
        success: true,
        message: 'Platform removed from the catalog successfully',
        data: result,
    });
}));
const listTeamPlatforms = (0, catchAsync_1.catchAsync)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield platformCatalog_service_1.PlatformCatalogService.listTeamPlatforms(req.params.teamId);
    (0, sendResponse_1.default)(res, {
        statusCode: httpStatus_1.httpStatus.OK,
        success: true,
        message: "Team's platforms retrieved successfully",
        data: result,
    });
}));
const enableForTeam = (0, catchAsync_1.catchAsync)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield platformCatalog_service_1.PlatformCatalogService.enableForTeam(req.params.teamId, req.params.platform, req.user.id);
    (0, sendResponse_1.default)(res, {
        statusCode: httpStatus_1.httpStatus.OK,
        success: true,
        message: 'Platform enabled for team successfully',
        data: result,
    });
}));
const disableForTeam = (0, catchAsync_1.catchAsync)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield platformCatalog_service_1.PlatformCatalogService.disableForTeam(req.params.teamId, req.params.platform);
    (0, sendResponse_1.default)(res, {
        statusCode: httpStatus_1.httpStatus.OK,
        success: true,
        message: 'Platform disabled for team successfully',
        data: result,
    });
}));
exports.PlatformCatalogController = {
    createPlatform,
    listPlatforms,
    enablePlatform,
    disablePlatform,
    deletePlatform,
    listTeamPlatforms,
    enableForTeam,
    disableForTeam,
};
