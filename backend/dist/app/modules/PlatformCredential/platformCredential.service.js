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
exports.PlatformCredentialService = void 0;
const AppError_1 = __importDefault(require("../../errors/AppError"));
const crypto_1 = require("../../lib/crypto");
const httpStatus_1 = require("../../utils/httpStatus");
const platformCatalog_service_1 = require("../PlatformCatalog/platformCatalog.service");
const platformCredential_model_1 = require("./platformCredential.model");
const upsertCredential = (teamId, payload, addedBy) => __awaiter(void 0, void 0, void 0, function* () {
    yield platformCatalog_service_1.PlatformCatalogService.assertTeamPlatformEnabled(teamId, payload.platform);
    const encrypted_token = (0, crypto_1.encrypt)(payload.token);
    const token_last4 = payload.token.slice(-4);
    return platformCredential_model_1.PlatformCredential.findOneAndUpdate({ team_id: teamId, platform: payload.platform }, {
        team_id: teamId,
        platform: payload.platform,
        encrypted_token,
        token_last4,
        account_id: payload.account_id,
        added_by: addedBy,
        updated_at: new Date(),
    }, { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true });
});
const listCredentials = (teamId) => __awaiter(void 0, void 0, void 0, function* () {
    // `encrypted_token` is `select: false` on the schema, so this naturally returns only metadata.
    return platformCredential_model_1.PlatformCredential.find({ team_id: teamId });
});
const revealCredential = (teamId, platform) => __awaiter(void 0, void 0, void 0, function* () {
    const credential = yield platformCredential_model_1.PlatformCredential.findOne({ team_id: teamId, platform }).select('+encrypted_token');
    if (!credential) {
        throw new AppError_1.default(httpStatus_1.httpStatus.NOT_FOUND, `No ${platform} credential is stored for this team`);
    }
    return {
        platform: credential.platform,
        account_id: credential.account_id,
        token: (0, crypto_1.decrypt)(credential.encrypted_token),
    };
});
const deleteCredential = (teamId, platform) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield platformCredential_model_1.PlatformCredential.findOneAndDelete({ team_id: teamId, platform });
    if (!result) {
        throw new AppError_1.default(httpStatus_1.httpStatus.NOT_FOUND, `No ${platform} credential is stored for this team`);
    }
    return result;
});
exports.PlatformCredentialService = {
    upsertCredential,
    listCredentials,
    revealCredential,
    deleteCredential,
};
