"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
// Runs before any test file (and before `config/index.ts`'s eager zod parse) is imported,
// so the whole suite gets schema-valid placeholder env vars without touching the real .env.
dotenv_1.default.config({ path: path_1.default.join(__dirname, '..', '..', '..', '.env.test') });
