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
exports.UserService = void 0;
const bcrypt_1 = __importDefault(require("bcrypt"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const config_1 = __importDefault(require("../../config"));
const AppError_1 = __importDefault(require("../../errors/AppError"));
const logger_1 = require("../../lib/logger");
const httpStatus_1 = require("../../utils/httpStatus");
const team_model_1 = require("../Team/team.model");
const team_service_1 = require("../Team/team.service");
const user_model_1 = require("./user.model");
const BCRYPT_COST = 10;
const signAccessToken = (payload) => jsonwebtoken_1.default.sign(Object.assign(Object.assign({}, payload), { token_type: 'access' }), config_1.default.jwt_secret, {
    expiresIn: config_1.default.jwt_expires_in,
});
const signRefreshToken = (payload) => jsonwebtoken_1.default.sign(Object.assign(Object.assign({}, payload), { token_type: 'refresh' }), config_1.default.jwt_refresh_secret, {
    expiresIn: config_1.default.jwt_refresh_expires_in,
});
/**
 * True when the token was issued before the user's last password change — such tokens are
 * dead. Backdated 1s on write (see changePassword) so a token issued in the same second as
 * the change itself stays valid.
 */
const issuedBeforePasswordChange = (user, iat) => {
    if (!user.password_changed_at || typeof iat !== 'number')
        return false;
    // iat has whole-second granularity; keep the change time fractional so the 1s backdate
    // isn't rounded away (flooring both sides would let a just-invalidated token survive).
    return iat < user.password_changed_at.getTime() / 1000;
};
/**
 * Admin-only. Self-registration was removed — every account is created deliberately, with a
 * role and (usually) a team assignment, so there's never a user floating around with neither.
 *
 * `requestingUserRole` is the HTTP caller's own role, used to block a regular admin from
 * creating/promoting another super_admin. It's omitted entirely when called from the
 * `seedAdmin` bootstrap script (no HTTP caller exists yet), which is what lets that script
 * create the very first super_admin.
 */
const createUser = (payload, requestingUserRole) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    if (payload.role === 'super_admin' && requestingUserRole && requestingUserRole !== 'super_admin') {
        throw new AppError_1.default(httpStatus_1.httpStatus.FORBIDDEN, 'Only a super_admin can create another super_admin');
    }
    const existing = yield user_model_1.User.findOne({ email: payload.email.toLowerCase() });
    if (existing) {
        throw new AppError_1.default(httpStatus_1.httpStatus.CONFLICT, 'An account with this email already exists');
    }
    const password_hash = yield bcrypt_1.default.hash(payload.password, BCRYPT_COST);
    const user = yield user_model_1.User.create({
        email: payload.email.toLowerCase(),
        password_hash,
        name: payload.name,
        role: (_a = payload.role) !== null && _a !== void 0 ? _a : 'user',
    });
    const teamIds = (_b = payload.team_ids) !== null && _b !== void 0 ? _b : [];
    if (teamIds.length) {
        yield team_model_1.TeamMembership.insertMany(teamIds.map((team_id) => ({ team_id, user_id: user._id })));
    }
    return user;
});
const listUsers = (teamId) => __awaiter(void 0, void 0, void 0, function* () {
    if (!teamId) {
        return user_model_1.User.find();
    }
    const memberships = yield team_model_1.TeamMembership.find({ team_id: teamId }).select('user_id');
    return user_model_1.User.find({ _id: { $in: memberships.map((m) => m.user_id) } });
});
const login = (payload) => __awaiter(void 0, void 0, void 0, function* () {
    const user = yield user_model_1.User.findOne({ email: payload.email.toLowerCase() }).select('+password_hash');
    // Same error for "no such user" and "wrong password" — a differing response would let an
    // attacker enumerate which emails have accounts.
    const passwordMatches = user ? yield bcrypt_1.default.compare(payload.password, user.password_hash) : false;
    if (!user || !passwordMatches) {
        throw new AppError_1.default(httpStatus_1.httpStatus.UNAUTHORIZED, 'Invalid email or password');
    }
    const tokenPayload = { id: user._id.toString(), email: user.email };
    return {
        token: signAccessToken(tokenPayload),
        refresh_token: signRefreshToken(tokenPayload),
        user,
    };
});
/**
 * Exchanges a valid refresh token for a fresh access token (and a rotated refresh token).
 * Rejects access tokens passed here, deleted users, and refresh tokens issued before the
 * user's last password change.
 */
const refreshToken = (token) => __awaiter(void 0, void 0, void 0, function* () {
    let payload;
    try {
        payload = jsonwebtoken_1.default.verify(token, config_1.default.jwt_refresh_secret);
    }
    catch (_a) {
        throw new AppError_1.default(httpStatus_1.httpStatus.UNAUTHORIZED, 'Invalid or expired refresh token');
    }
    if (payload.token_type !== 'refresh') {
        throw new AppError_1.default(httpStatus_1.httpStatus.UNAUTHORIZED, 'Invalid or expired refresh token');
    }
    const user = yield user_model_1.User.findById(payload.id);
    if (!user || issuedBeforePasswordChange(user, payload.iat)) {
        throw new AppError_1.default(httpStatus_1.httpStatus.UNAUTHORIZED, 'Invalid or expired refresh token');
    }
    const tokenPayload = { id: user._id.toString(), email: user.email };
    return {
        token: signAccessToken(tokenPayload),
        refresh_token: signRefreshToken(tokenPayload),
        user,
    };
});
const changePassword = (userId, payload) => __awaiter(void 0, void 0, void 0, function* () {
    const user = yield user_model_1.User.findById(userId).select('+password_hash');
    if (!user) {
        throw new AppError_1.default(httpStatus_1.httpStatus.NOT_FOUND, 'User not found');
    }
    const matches = yield bcrypt_1.default.compare(payload.old_password, user.password_hash);
    if (!matches) {
        throw new AppError_1.default(httpStatus_1.httpStatus.UNAUTHORIZED, 'Current password is incorrect');
    }
    user.password_hash = yield bcrypt_1.default.hash(payload.new_password, BCRYPT_COST);
    // Backdate 1s so tokens issued in this same second (e.g. the response's fresh pair) survive.
    user.password_changed_at = new Date(Date.now() - 1000);
    yield user.save();
    // Every previously issued token is now dead — hand back a fresh pair so the frontend
    // can keep the session alive without forcing a re-login.
    const tokenPayload = { id: user._id.toString(), email: user.email };
    return {
        token: signAccessToken(tokenPayload),
        refresh_token: signRefreshToken(tokenPayload),
    };
});
/**
 * No SMTP is configured in this deployment, so instead of emailing the reset link the token
 * is logged server-side (operator can relay it), and returned in the response body outside
 * production for frontend development. The response message is identical whether or not the
 * email has an account — no enumeration.
 */
const forgotPassword = (email) => __awaiter(void 0, void 0, void 0, function* () {
    const user = yield user_model_1.User.findOne({ email: email.toLowerCase() });
    if (!user) {
        return { reset_token: undefined };
    }
    const reset_token = jsonwebtoken_1.default.sign({ id: user._id.toString(), email: user.email, token_type: 'password_reset' }, config_1.default.jwt_secret, { expiresIn: '15m' });
    logger_1.logger.info({ email: user.email }, 'Password reset token issued (no SMTP configured — relay manually)');
    return { reset_token: config_1.default.node_env !== 'production' ? reset_token : undefined };
});
const resetPassword = (payload) => __awaiter(void 0, void 0, void 0, function* () {
    let tokenPayload;
    try {
        tokenPayload = jsonwebtoken_1.default.verify(payload.token, config_1.default.jwt_secret);
    }
    catch (_a) {
        throw new AppError_1.default(httpStatus_1.httpStatus.UNAUTHORIZED, 'Invalid or expired reset token');
    }
    if (tokenPayload.token_type !== 'password_reset') {
        throw new AppError_1.default(httpStatus_1.httpStatus.UNAUTHORIZED, 'Invalid or expired reset token');
    }
    const user = yield user_model_1.User.findById(tokenPayload.id);
    // The password_changed_at check makes reset tokens single-use: once the password changes,
    // any reset token issued earlier (including this one) is rejected.
    if (!user || issuedBeforePasswordChange(user, tokenPayload.iat)) {
        throw new AppError_1.default(httpStatus_1.httpStatus.UNAUTHORIZED, 'Invalid or expired reset token');
    }
    user.password_hash = yield bcrypt_1.default.hash(payload.new_password, BCRYPT_COST);
    user.password_changed_at = new Date(Date.now() - 1000);
    yield user.save();
});
const getMe = (userId) => __awaiter(void 0, void 0, void 0, function* () {
    const user = yield user_model_1.User.findById(userId);
    if (!user) {
        throw new AppError_1.default(httpStatus_1.httpStatus.NOT_FOUND, 'User not found');
    }
    const teamIds = yield team_service_1.TeamService.getTeamIdsForUser(userId);
    return { user, team_ids: teamIds };
});
exports.UserService = {
    createUser,
    listUsers,
    login,
    refreshToken,
    changePassword,
    forgotPassword,
    resetPassword,
    getMe,
};
