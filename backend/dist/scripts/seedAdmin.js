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
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Bootstraps the very first admin (or super_admin) account. Necessary because public
 * self-registration was removed — every user is created by an admin, so something has to
 * create the first one. Calls `UserService.createUser` directly with no HTTP caller, which is
 * what lets it create a `super_admin` even though the escalation guard normally requires the
 * caller to already be one.
 *
 * Run: npm run seed:admin -- <email> <password> <name> [role]
 * (or set SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD / SEED_ADMIN_NAME / SEED_ADMIN_ROLE instead of args)
 * `role` defaults to "admin"; pass "super_admin" to bootstrap the platform-catalog owner.
 */
const mongoose_1 = __importDefault(require("mongoose"));
const config_1 = __importDefault(require("../app/config"));
const user_service_1 = require("../app/modules/User/user.service");
const [, , argEmail, argPassword, argName, argRole] = process.argv;
const email = argEmail !== null && argEmail !== void 0 ? argEmail : process.env.SEED_ADMIN_EMAIL;
const password = argPassword !== null && argPassword !== void 0 ? argPassword : process.env.SEED_ADMIN_PASSWORD;
const name = argName !== null && argName !== void 0 ? argName : process.env.SEED_ADMIN_NAME;
const role = ((_a = argRole !== null && argRole !== void 0 ? argRole : process.env.SEED_ADMIN_ROLE) !== null && _a !== void 0 ? _a : 'admin');
const main = () => __awaiter(void 0, void 0, void 0, function* () {
    if (!email || !password || !name) {
        console.error('Usage: npm run seed:admin -- <email> <password> <name> [role]');
        process.exit(1);
    }
    if (role !== 'admin' && role !== 'super_admin') {
        console.error(`Invalid role "${role}" — must be "admin" or "super_admin"`);
        process.exit(1);
    }
    yield mongoose_1.default.connect(config_1.default.database_url);
    const admin = yield user_service_1.UserService.createUser({ email, password, name, role });
    console.log(`[seedAdmin] created ${role} ${admin.email} (${admin._id.toString()})`);
    yield mongoose_1.default.disconnect();
});
main().catch((err) => {
    console.error('[seedAdmin] failed:', err instanceof Error ? err.message : err);
    process.exit(1);
});
