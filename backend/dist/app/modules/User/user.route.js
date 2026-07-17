"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserRoutes = exports.AuthRoutes = void 0;
const express_1 = require("express");
const auth_1 = require("../../middleware/auth");
const validation_1 = require("../../middleware/validation");
const user_controller_1 = require("./user.controller");
const user_validation_1 = require("./user.validation");
// Authentication. Public: login, refresh-token, logout, forgot/reset password.
// Authenticated: me, change-password.
const authRouter = (0, express_1.Router)();
authRouter.post('/login', (0, validation_1.validation)(user_validation_1.UserValidation.loginValidation), user_controller_1.UserController.login);
authRouter.post('/refresh-token', (0, validation_1.validation)(user_validation_1.UserValidation.refreshTokenValidation), user_controller_1.UserController.refreshToken);
authRouter.post('/logout', user_controller_1.UserController.logout);
authRouter.post('/change-password', auth_1.requireAuth, (0, validation_1.validation)(user_validation_1.UserValidation.changePasswordValidation), user_controller_1.UserController.changePassword);
authRouter.post('/forgot-password', (0, validation_1.validation)(user_validation_1.UserValidation.forgotPasswordValidation), user_controller_1.UserController.forgotPassword);
authRouter.post('/reset-password', (0, validation_1.validation)(user_validation_1.UserValidation.resetPasswordValidation), user_controller_1.UserController.resetPassword);
authRouter.get('/me', auth_1.requireAuth, user_controller_1.UserController.getMe);
exports.AuthRoutes = authRouter;
// User management: admin-only. Self-registration was removed — admins create every account.
const userRouter = (0, express_1.Router)();
userRouter.use(auth_1.requireAuth, auth_1.requireAdmin);
userRouter.post('/', (0, validation_1.validation)(user_validation_1.UserValidation.createUserValidation), user_controller_1.UserController.createUser);
userRouter.get('/', user_controller_1.UserController.listUsers);
exports.UserRoutes = userRouter;
