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
exports.verifyConnections = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const logger_1 = require("./logger");
const redis_1 = require("./redis");
const llmClient_1 = require("./llmClient");
const embeddings_1 = require("./embeddings");
const withLabel = (label, fn) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield fn();
        logger_1.logger.info(`[verifyConnections] ${label}: OK`);
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(`[verifyConnections] ${label} FAILED: ${message}`);
    }
});
/**
 * Fails fast and loud if Mongo, Redis, or the LLM/embedding clients are
 * misconfigured — critical fixes #1 and #2 exist precisely so this doesn't
 * get discovered mid-integration on demo day.
 */
const verifyConnections = () => __awaiter(void 0, void 0, void 0, function* () {
    yield withLabel('MongoDB (Atlas)', () => __awaiter(void 0, void 0, void 0, function* () {
        const db = mongoose_1.default.connection.db;
        if (!db)
            throw new Error('Mongoose connection not established');
        yield db.admin().ping();
    }));
    yield withLabel('Redis', redis_1.pingRedis);
    yield withLabel('OpenRouter LLM', () => __awaiter(void 0, void 0, void 0, function* () {
        yield (0, llmClient_1.chatCompletion)({
            model: llmClient_1.LLM_MODELS.fallback,
            messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
        });
    }));
    yield withLabel('Embeddings (OpenRouter)', () => __awaiter(void 0, void 0, void 0, function* () {
        const vector = yield (0, embeddings_1.embed)('connectivity check');
        if (!vector.length)
            throw new Error('Embedding provider returned an empty vector');
    }));
});
exports.verifyConnections = verifyConnections;
