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
exports.chatCompletion = exports.LLM_MODELS = void 0;
const config_1 = __importDefault(require("../config"));
const logger_1 = require("./logger");
const openrouterClient_1 = require("./openrouterClient");
exports.LLM_MODELS = {
    /** Categorization, report generation, chat — fast, structured output */
    standard: config_1.default.llm_model_standard,
    /** Content generation (FB/LinkedIn/YouTube/captions) — stronger creative writing */
    content: config_1.default.llm_model_content,
    /** Always-available backup if the primary model is rate-limited or down */
    fallback: config_1.default.llm_model_fallback,
};
const completeWith = (model, messages, temperature) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const completion = yield openrouterClient_1.openrouter.chat.completions.create({
        model,
        messages,
        temperature,
    });
    const content = (_b = (_a = completion.choices[0]) === null || _a === void 0 ? void 0 : _a.message) === null || _b === void 0 ? void 0 : _b.content;
    if (typeof content !== 'string') {
        throw new Error('OpenRouter chat completion returned no message content');
    }
    return content;
});
/**
 * Chat completion with automatic failover: if the requested model errors (rate limit,
 * outage, empty response), the call is retried once on `LLM_MODELS.fallback` so a single
 * 429 on the free tier doesn't hard-fail generate/chat/report requests.
 */
const chatCompletion = (_a) => __awaiter(void 0, [_a], void 0, function* ({ model, messages, temperature = 0.7, }) {
    try {
        return yield completeWith(model, messages, temperature);
    }
    catch (primaryError) {
        const fallbackModel = exports.LLM_MODELS.fallback;
        if (!fallbackModel || fallbackModel === model) {
            throw primaryError;
        }
        logger_1.logger.warn({ model, fallbackModel, err: primaryError instanceof Error ? primaryError.message : primaryError }, 'Primary LLM model failed, retrying on fallback model');
        return completeWith(fallbackModel, messages, temperature);
    }
});
exports.chatCompletion = chatCompletion;
