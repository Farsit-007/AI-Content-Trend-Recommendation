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
exports.UserController = void 0;
const config_1 = __importDefault(require("../../config"));
const AppError_1 = __importDefault(require("../../errors/AppError"));
const catchAsync_1 = require("../../utils/catchAsync");
const httpStatus_1 = require("../../utils/httpStatus");
const sendResponse_1 = __importDefault(require("../../utils/sendResponse"));
const user_service_1 = require("./user.service");
const REFRESH_COOKIE = 'refresh_token';
// '30d' / '12h' / '15m' / '45s' → milliseconds, for the cookie maxAge.
const durationToMs = (duration) => {
    const match = /^(\d+)([smhd])$/.exec(duration.trim());
    if (!match)
        return 30 * 24 * 60 * 60 * 1000;
    const value = Number(match[1]);
    const unit = { s: 1000, m: 60000, h: 3600000, d: 86400000 }[match[2]];
    return value * unit;
};
// SameSite=Lax covers localhost dev (5173 → backend port is same-site); production may serve
// the frontend from another domain, which needs None + Secure for the cookie to be sent.
const refreshCookieOptions = {
    httpOnly: true,
    secure: config_1.default.node_env === 'production',
    sameSite: config_1.default.node_env === 'production' ? 'none' : 'lax',
    path: '/api/v1/auth',
    maxAge: durationToMs(config_1.default.jwt_refresh_expires_in),
};
const setRefreshCookie = (res, token) => res.cookie(REFRESH_COOKIE, token, refreshCookieOptions);
const createUser = (0, catchAsync_1.catchAsync)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield user_service_1.UserService.createUser(req.body, req.user.role);
    (0, sendResponse_1.default)(res, {
        statusCode: httpStatus_1.httpStatus.CREATED,
        success: true,
        message: 'User created successfully',
        data: result,
    });
}));
const listUsers = (0, catchAsync_1.catchAsync)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield user_service_1.UserService.listUsers(req.query.team_id);
    (0, sendResponse_1.default)(res, {
        statusCode: httpStatus_1.httpStatus.OK,
        success: true,
        message: 'Users retrieved successfully',
        data: result,
    });
}));
const login = (0, catchAsync_1.catchAsync)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { token, refresh_token, user } = yield user_service_1.UserService.login(req.body);
    setRefreshCookie(res, refresh_token);
    (0, sendResponse_1.default)(res, {
        statusCode: httpStatus_1.httpStatus.OK,
        success: true,
        message: 'Logged in successfully',
        // refresh_token is also in the body for non-browser clients (Postman, scripts);
        // browsers should rely on the httpOnly cookie.
        data: { token, refresh_token, user },
    });
}));
const refreshToken = (0, catchAsync_1.catchAsync)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    const token = (_b = (_a = req.cookies) === null || _a === void 0 ? void 0 : _a[REFRESH_COOKIE]) !== null && _b !== void 0 ? _b : (_c = req.body) === null || _c === void 0 ? void 0 : _c.refresh_token;
    if (!token) {
        throw new AppError_1.default(httpStatus_1.httpStatus.UNAUTHORIZED, 'Refresh token is required');
    }
    const result = yield user_service_1.UserService.refreshToken(token);
    setRefreshCookie(res, result.refresh_token);
    (0, sendResponse_1.default)(res, {
        statusCode: httpStatus_1.httpStatus.OK,
        success: true,
        message: 'Token refreshed successfully',
        data: { token: result.token, refresh_token: result.refresh_token, user: result.user },
    });
}));
// Access tokens are stateless JWTs, so logout = clearing the refresh cookie; the frontend
// drops its access token, which then simply ages out.
const logout = (0, catchAsync_1.catchAsync)((_req, res) => __awaiter(void 0, void 0, void 0, function* () {
    res.clearCookie(REFRESH_COOKIE, Object.assign(Object.assign({}, refreshCookieOptions), { maxAge: undefined }));
    (0, sendResponse_1.default)(res, {
        statusCode: httpStatus_1.httpStatus.OK,
        success: true,
        message: 'Logged out successfully',
        data: null,
    });
}));
const changePassword = (0, catchAsync_1.catchAsync)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield user_service_1.UserService.changePassword(req.user.id, req.body);
    setRefreshCookie(res, result.refresh_token);
    (0, sendResponse_1.default)(res, {
        statusCode: httpStatus_1.httpStatus.OK,
        success: true,
        message: 'Password changed successfully',
        data: { token: result.token, refresh_token: result.refresh_token },
    });
}));
const forgotPassword = (0, catchAsync_1.catchAsync)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { reset_token } = yield user_service_1.UserService.forgotPassword(req.body.email);
    (0, sendResponse_1.default)(res, {
        statusCode: httpStatus_1.httpStatus.OK,
        success: true,
        message: 'If an account exists for that email, a password reset token has been issued',
        data: reset_token ? { reset_token } : null,
    });
}));
const resetPassword = (0, catchAsync_1.catchAsync)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    yield user_service_1.UserService.resetPassword(req.body);
    (0, sendResponse_1.default)(res, {
        statusCode: httpStatus_1.httpStatus.OK,
        success: true,
        message: 'Password reset successfully',
        data: null,
    });
}));
const getMe = (0, catchAsync_1.catchAsync)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield user_service_1.UserService.getMe(req.user.id);
    (0, sendResponse_1.default)(res, {
        statusCode: httpStatus_1.httpStatus.OK,
        success: true,
        message: 'Current user retrieved successfully',
        data: result,
    });
}));
exports.UserController = {
    createUser,
    listUsers,
    login,
    refreshToken,
    logout,
    changePassword,
    forgotPassword,
    resetPassword,
    getMe,
};
