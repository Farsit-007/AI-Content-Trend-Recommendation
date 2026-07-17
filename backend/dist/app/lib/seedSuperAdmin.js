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
exports.seedSuperAdminIfMissing = void 0;
const config_1 = __importDefault(require("../config"));
const logger_1 = require("./logger");
const user_model_1 = require("../modules/User/user.model");
const user_service_1 = require("../modules/User/user.service");
/**
 * Ensures the `SUPER_ADMIN_EMAIL` account exists as a `super_admin` every time the server boots —
 * idempotent, so it's safe to run on every restart. A no-op (with a log line) if the env vars
 * aren't set, or if an account with that email already exists (its role/password are never
 * touched here, so this never silently overwrites something an admin changed by hand).
 *
 * This is the automatic counterpart to `npm run seed:admin` — that script stays for creating
 * *additional* admins/super_admins on demand; this one guarantees the very first super_admin
 * always exists without anyone having to remember to run a script.
 */
const seedSuperAdminIfMissing = () => __awaiter(void 0, void 0, void 0, function* () {
    const { email, password, name } = config_1.default.super_admin;
    if (!email || !password) {
        logger_1.logger.info('[seedSuperAdmin] SUPER_ADMIN_EMAIL/SUPER_ADMIN_PASSWORD not set — skipping');
        return;
    }
    const existing = yield user_model_1.User.findOne({ email: email.toLowerCase() });
    if (existing) {
        logger_1.logger.info(`[seedSuperAdmin] ${email} already exists — skipping`);
        return;
    }
    const superAdmin = yield user_service_1.UserService.createUser({
        email,
        password,
        name: name !== null && name !== void 0 ? name : 'Super Admin',
        role: 'super_admin',
    });
    logger_1.logger.info(`[seedSuperAdmin] created super_admin ${superAdmin.email} (${superAdmin._id.toString()})`);
});
exports.seedSuperAdminIfMissing = seedSuperAdminIfMissing;
