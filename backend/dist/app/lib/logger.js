"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
const pino_1 = __importDefault(require("pino"));
const isProduction = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';
/**
 * Single shared pino instance. Pretty-printed in development, raw JSON in
 * production (machine-parseable), silent in tests to keep jest output clean.
 */
exports.logger = (0, pino_1.default)(Object.assign({ level: isTest ? 'silent' : process.env.LOG_LEVEL || 'info' }, (isProduction
    ? {}
    : {
        transport: {
            target: 'pino-pretty',
            options: { colorize: true, translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' },
        },
    })));
