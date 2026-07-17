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
exports.embedBatch = exports.embed = void 0;
const config_1 = __importDefault(require("../config"));
const logger_1 = require("./logger");
const openrouterClient_1 = require("./openrouterClient");
/**
 * Conservative char cap for embedding input. The model's actual limit is 8192 *tokens*; using
 * chars keeps this dependency-free, and 6000 chars stays well under 8192 tokens even for
 * pathologically token-dense text (e.g. dense non-Latin scripts, ~1 char/token worst case).
 * Some sources (RSS `contentSnippet` in particular) pass through full unbounded article text —
 * without a cap, one oversized item throws the whole request (single call) or the whole batch
 * (`embedBatch`) rather than just failing to embed that one item well.
 */
const MAX_INPUT_CHARS = 6000;
const embed = (text) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const response = yield openrouterClient_1.openrouter.embeddings.create({
        model: config_1.default.embedding_model,
        input: text.slice(0, MAX_INPUT_CHARS),
    });
    const vector = (_b = (_a = response.data) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.embedding;
    if (!Array.isArray(vector)) {
        throw new Error('OpenRouter embedding response did not contain a vector');
    }
    return vector;
});
exports.embed = embed;
/**
 * Batches multiple texts into one embeddings call. Callers with high item counts (e.g. news
 * ingestion) must not fire one HTTP request per item via `Promise.all` — that floods OpenRouter
 * with concurrent requests and the provider intermittently answers with a malformed/error body
 * under that burst load. One request per batch keeps concurrent request volume bounded.
 */
const embedBatch = (texts) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    if (texts.length === 0)
        return [];
    const response = yield openrouterClient_1.openrouter.embeddings.create({
        model: config_1.default.embedding_model,
        input: texts.map((text) => text.slice(0, MAX_INPUT_CHARS)),
    });
    const vectors = (_a = response.data) === null || _a === void 0 ? void 0 : _a.map((entry) => entry.embedding);
    if (!Array.isArray(vectors) || vectors.length !== texts.length || vectors.some((v) => !Array.isArray(v))) {
        logger_1.logger.error({ response }, '[embeddings] OpenRouter batch response did not contain the expected vectors');
        throw new Error('OpenRouter embedding response did not contain the expected vectors');
    }
    return vectors;
});
exports.embedBatch = embedBatch;
