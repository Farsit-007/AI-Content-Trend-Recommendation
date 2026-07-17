"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatMessage = void 0;
const mongoose_1 = require("mongoose");
const chatMessageSchema = new mongoose_1.Schema({
    team_id: { type: String, required: true },
    conversation_id: { type: String, required: true },
    role: { type: String, enum: ['user', 'assistant'], required: true },
    content: { type: String, required: true },
    created_at: { type: Date, default: Date.now },
});
chatMessageSchema.index({ team_id: 1, conversation_id: 1, created_at: 1 });
exports.ChatMessage = (0, mongoose_1.model)('ChatMessage', chatMessageSchema, 'chat_messages');
