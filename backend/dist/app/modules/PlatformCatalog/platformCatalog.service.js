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
exports.PlatformCatalogService = void 0;
const AppError_1 = __importDefault(require("../../errors/AppError"));
const httpStatus_1 = require("../../utils/httpStatus");
const platformCatalog_model_1 = require("./platformCatalog.model");
const createPlatform = (payload, createdBy) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const existing = yield platformCatalog_model_1.PlatformCatalog.findOne({ name: payload.name.toLowerCase() });
    if (existing) {
        throw new AppError_1.default(httpStatus_1.httpStatus.CONFLICT, `Platform "${payload.name}" already exists in the catalog`);
    }
    return platformCatalog_model_1.PlatformCatalog.create({
        name: payload.name,
        label: payload.label,
        is_enabled: (_a = payload.is_enabled) !== null && _a !== void 0 ? _a : true,
        created_by: createdBy,
    });
});
/** super_admin sees every entry (incl. disabled, for management); everyone else sees only what's available to enable. */
const listPlatforms = (requestingUser) => __awaiter(void 0, void 0, void 0, function* () {
    if (requestingUser.role === 'super_admin') {
        return platformCatalog_model_1.PlatformCatalog.find();
    }
    return platformCatalog_model_1.PlatformCatalog.find({ is_enabled: true });
});
const setPlatformEnabled = (name, is_enabled) => __awaiter(void 0, void 0, void 0, function* () {
    const platform = yield platformCatalog_model_1.PlatformCatalog.findOneAndUpdate({ name: name.toLowerCase() }, { is_enabled, updated_at: new Date() }, { new: true });
    if (!platform) {
        throw new AppError_1.default(httpStatus_1.httpStatus.NOT_FOUND, `Platform "${name}" is not in the catalog`);
    }
    return platform;
});
const deletePlatform = (name) => __awaiter(void 0, void 0, void 0, function* () {
    const platform = yield platformCatalog_model_1.PlatformCatalog.findOneAndDelete({ name: name.toLowerCase() });
    if (!platform) {
        throw new AppError_1.default(httpStatus_1.httpStatus.NOT_FOUND, `Platform "${name}" is not in the catalog`);
    }
    yield platformCatalog_model_1.TeamPlatform.deleteMany({ platform: name.toLowerCase() });
    return platform;
});
/** For every globally-enabled catalog platform, reports whether this team has it turned on. */
const listTeamPlatforms = (teamId) => __awaiter(void 0, void 0, void 0, function* () {
    const [catalog, teamRows] = yield Promise.all([
        platformCatalog_model_1.PlatformCatalog.find({ is_enabled: true }),
        platformCatalog_model_1.TeamPlatform.find({ team_id: teamId }),
    ]);
    const teamRowByPlatform = new Map(teamRows.map((row) => [row.platform, row]));
    return catalog.map((entry) => {
        var _a, _b;
        return ({
            name: entry.name,
            label: entry.label,
            team_enabled: (_b = (_a = teamRowByPlatform.get(entry.name)) === null || _a === void 0 ? void 0 : _a.is_enabled) !== null && _b !== void 0 ? _b : false,
        });
    });
});
const enableForTeam = (teamId, platform, enabledBy) => __awaiter(void 0, void 0, void 0, function* () {
    const catalogEntry = yield platformCatalog_model_1.PlatformCatalog.findOne({ name: platform.toLowerCase() });
    if (!catalogEntry || !catalogEntry.is_enabled) {
        throw new AppError_1.default(httpStatus_1.httpStatus.BAD_REQUEST, `"${platform}" is not currently available — ask a super_admin to add or enable it first`);
    }
    return platformCatalog_model_1.TeamPlatform.findOneAndUpdate({ team_id: teamId, platform: platform.toLowerCase() }, { team_id: teamId, platform: platform.toLowerCase(), is_enabled: true, enabled_by: enabledBy, updated_at: new Date() }, { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true });
});
/** A team can always turn its own switch off, regardless of the platform's current global state. */
const disableForTeam = (teamId, platform) => __awaiter(void 0, void 0, void 0, function* () {
    const row = yield platformCatalog_model_1.TeamPlatform.findOneAndUpdate({ team_id: teamId, platform: platform.toLowerCase() }, { is_enabled: false, updated_at: new Date() }, { new: true });
    if (!row) {
        throw new AppError_1.default(httpStatus_1.httpStatus.NOT_FOUND, `Team has not enabled "${platform}"`);
    }
    return row;
});
/** Non-throwing check — used by `getPlatformToken()` so a disabled platform silently fails over instead of erroring deep in a low-level accessor. */
const isTeamPlatformEnabled = (teamId, platform) => __awaiter(void 0, void 0, void 0, function* () {
    const [catalogEntry, teamRow] = yield Promise.all([
        platformCatalog_model_1.PlatformCatalog.findOne({ name: platform.toLowerCase() }),
        platformCatalog_model_1.TeamPlatform.findOne({ team_id: teamId, platform: platform.toLowerCase() }),
    ]);
    return Boolean((catalogEntry === null || catalogEntry === void 0 ? void 0 : catalogEntry.is_enabled) && (teamRow === null || teamRow === void 0 ? void 0 : teamRow.is_enabled));
});
/** Throwing variant — used before writing a credential, where a clear 400 is more useful than a silent no-op. */
const assertTeamPlatformEnabled = (teamId, platform) => __awaiter(void 0, void 0, void 0, function* () {
    if (!(yield isTeamPlatformEnabled(teamId, platform))) {
        throw new AppError_1.default(httpStatus_1.httpStatus.BAD_REQUEST, `Your team hasn't enabled "${platform}" yet — enable it first via /teams/${teamId}/platforms/${platform}/enable`);
    }
});
exports.PlatformCatalogService = {
    createPlatform,
    listPlatforms,
    setPlatformEnabled,
    deletePlatform,
    listTeamPlatforms,
    enableForTeam,
    disableForTeam,
    isTeamPlatformEnabled,
    assertTeamPlatformEnabled,
};
