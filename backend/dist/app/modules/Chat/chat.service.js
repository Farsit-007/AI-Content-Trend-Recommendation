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
exports.ChatService = void 0;
const crypto_1 = require("crypto");
const AppError_1 = __importDefault(require("../../errors/AppError"));
const embeddings_1 = require("../../lib/embeddings");
const llmClient_1 = require("../../lib/llmClient");
const logger_1 = require("../../lib/logger");
const voiceProfile_1 = require("../../lib/voiceProfile");
const httpStatus_1 = require("../../utils/httpStatus");
const chat_intent_1 = require("./chat.intent");
const chat_model_1 = require("./chat.model");
const chat_prompt_1 = require("./chat.prompt");
const chat_retrieval_1 = require("./chat.retrieval");
const assertTeamAccess = (teamId, requestingUser) => {
    if (requestingUser.role === 'admin' || requestingUser.role === 'super_admin')
        return;
    if (!requestingUser.team_ids.includes(teamId)) {
        throw new AppError_1.default(httpStatus_1.httpStatus.FORBIDDEN, 'You do not have access to this team');
    }
};
const askChat = (payload, requestingUser) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    assertTeamAccess(payload.team_id, requestingUser);
    const conversationId = (_a = payload.conversation_id) !== null && _a !== void 0 ? _a : (0, crypto_1.randomUUID)();
    const [questionEmbedding, history, voiceOptions] = yield Promise.all([
        (0, embeddings_1.embed)(payload.message),
        (0, chat_retrieval_1.fetchConversationHistory)(payload.team_id, conversationId),
        (0, voiceProfile_1.resolveVoiceOptions)(payload.team_id, payload.language),
    ]);
    const intent = (0, chat_intent_1.classifyIntent)(payload.message);
    const contextGroups = yield Promise.all([
        intent.news ? (0, chat_retrieval_1.fetchNewsContext)(questionEmbedding) : Promise.resolve([]),
        intent.performance
            ? (0, chat_retrieval_1.fetchPerformanceContext)(payload.team_id, questionEmbedding)
            : Promise.resolve([]),
    ]);
    const context = contextGroups.flat();
    const messages = (0, chat_prompt_1.buildMessages)(payload.message, context, history, voiceOptions);
    yield chat_model_1.ChatMessage.create({
        team_id: payload.team_id,
        conversation_id: conversationId,
        role: 'user',
        content: payload.message,
    });
    let reply;
    try {
        reply = yield (0, llmClient_1.chatCompletion)({ model: llmClient_1.LLM_MODELS.standard, messages, temperature: 0.7 });
    }
    catch (err) {
        logger_1.logger.error({ err: err instanceof Error ? err.message : err }, '[Chat] LLM call failed');
        throw new AppError_1.default(httpStatus_1.httpStatus.BAD_GATEWAY, 'Chat request failed — please try again');
    }
    yield chat_model_1.ChatMessage.create({
        team_id: payload.team_id,
        conversation_id: conversationId,
        role: 'assistant',
        content: reply,
    });
    return { conversation_id: conversationId, reply };
});
exports.ChatService = {
    askChat,
};
