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
exports.requireTeamAccess = exports.requireSuperAdmin = exports.requireAdmin = exports.optionalAuth = exports.requireAuth = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const config_1 = __importDefault(require("../config"));
const AppError_1 = __importDefault(require("../errors/AppError"));
const user_model_1 = require("../modules/User/user.model");
const team_service_1 = require("../modules/Team/team.service");
const catchAsync_1 = require("../utils/catchAsync");
const httpStatus_1 = require("../utils/httpStatus");
exports.requireAuth = (0, catchAsync_1.catchAsync)((req, _res, next) => __awaiter(void 0, void 0, void 0, function* () {
    const header = req.headers.authorization;
    if (!(header === null || header === void 0 ? void 0 : header.startsWith('Bearer '))) {
        throw new AppError_1.default(httpStatus_1.httpStatus.UNAUTHORIZED, 'Authentication required');
    }
    let payload;
    try {
        payload = jsonwebtoken_1.default.verify(header.slice('Bearer '.length), config_1.default.jwt_secret);
    }
    catch (_a) {
        // Covers expired, malformed, and bad-signature tokens alike.
        throw new AppError_1.default(httpStatus_1.httpStatus.UNAUTHORIZED, 'Invalid or expired token');
    }
    // Refresh and password-reset tokens must never work as access tokens (legacy access
    // tokens carry no token_type claim, so absence is accepted).
    if (payload.token_type && payload.token_type !== 'access') {
        throw new AppError_1.default(httpStatus_1.httpStatus.UNAUTHORIZED, 'Invalid or expired token');
    }
    // The token can outlive the account it names, so confirm the user still exists, and read
    // role/team membership fresh from the DB rather than trusting the token — so a role change or
    // team removal takes effect on the very next request instead of waiting for token expiry.
    const user = yield user_model_1.User.findById(payload.id);
    if (!user) {
        throw new AppError_1.default(httpStatus_1.httpStatus.UNAUTHORIZED, 'Invalid or expired token');
    }
    // A password change kills every token issued before it. iat has whole-second granularity;
    // the change time stays fractional so its 1s backdate isn't rounded away.
    if (user.password_changed_at && typeof payload.iat === 'number'
        && payload.iat < user.password_changed_at.getTime() / 1000) {
        throw new AppError_1.default(httpStatus_1.httpStatus.UNAUTHORIZED, 'Password was changed — please log in again');
    }
    const team_ids = yield team_service_1.TeamService.getTeamIdsForUser(user._id.toString());
    req.user = { id: user._id.toString(), email: user.email, role: user.role, team_ids };
    next();
}));
/**
 * Like `requireAuth` but never rejects the request — attaches `req.user` when a valid bearer
 * token is present, otherwise leaves it undefined. For routes that stay publicly readable but
 * personalize the response (e.g. team overrides) when the caller happens to be signed in.
 */
exports.optionalAuth = (0, catchAsync_1.catchAsync)((req, _res, next) => __awaiter(void 0, void 0, void 0, function* () {
    const header = req.headers.authorization;
    if (!(header === null || header === void 0 ? void 0 : header.startsWith('Bearer '))) {
        return next();
    }
    try {
        const payload = jsonwebtoken_1.default.verify(header.slice('Bearer '.length), config_1.default.jwt_secret);
        if (payload.token_type && payload.token_type !== 'access') {
            return next();
        }
        const user = yield user_model_1.User.findById(payload.id);
        if (user) {
            const team_ids = yield team_service_1.TeamService.getTeamIdsForUser(user._id.toString());
            req.user = { id: user._id.toString(), email: user.email, role: user.role, team_ids };
        }
    }
    catch (_a) {
        // Invalid/expired token on an optional-auth route — proceed unauthenticated rather than fail.
    }
    next();
}));
/** Gate for admin-only routes. A super_admin can do everything an admin can. Must run after `requireAuth`. */
const requireAdmin = (req, _res, next) => {
    var _a, _b;
    if (((_a = req.user) === null || _a === void 0 ? void 0 : _a.role) !== 'admin' && ((_b = req.user) === null || _b === void 0 ? void 0 : _b.role) !== 'super_admin') {
        throw new AppError_1.default(httpStatus_1.httpStatus.FORBIDDEN, 'Admin access required');
    }
    next();
};
exports.requireAdmin = requireAdmin;
/** Gate for super_admin-only routes, e.g. managing the platform catalog. Must run after `requireAuth`. */
const requireSuperAdmin = (req, _res, next) => {
    var _a;
    if (((_a = req.user) === null || _a === void 0 ? void 0 : _a.role) !== 'super_admin') {
        throw new AppError_1.default(httpStatus_1.httpStatus.FORBIDDEN, 'Super admin access required');
    }
    next();
};
exports.requireSuperAdmin = requireSuperAdmin;
/**
 * Gate for team-scoped routes, e.g. `/teams/:teamId/...`. Admins and super_admins pass regardless
 * of membership; everyone else must be a member of the team named by `req.params[paramName]`.
 * Must run after `requireAuth`.
 */
const requireTeamAccess = (paramName = 'teamId') => (req, _res, next) => {
    var _a, _b, _c;
    if (((_a = req.user) === null || _a === void 0 ? void 0 : _a.role) === 'admin' || ((_b = req.user) === null || _b === void 0 ? void 0 : _b.role) === 'super_admin') {
        return next();
    }
    const teamId = req.params[paramName];
    if (!teamId || !((_c = req.user) === null || _c === void 0 ? void 0 : _c.team_ids.includes(teamId))) {
        throw new AppError_1.default(httpStatus_1.httpStatus.FORBIDDEN, 'You do not have access to this team');
    }
    next();
};
exports.requireTeamAccess = requireTeamAccess;
