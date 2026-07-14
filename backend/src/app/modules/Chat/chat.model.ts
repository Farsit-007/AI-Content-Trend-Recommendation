import { Schema, model } from 'mongoose';
import { IChatMessage } from './chat.interface';

const chatMessageSchema = new Schema<IChatMessage>({
  team_id: { type: String, required: true },
  conversation_id: { type: String, required: true },
  role: { type: String, enum: ['user', 'assistant'], required: true },
  content: { type: String, required: true },
  created_at: { type: Date, default: Date.now },
});

chatMessageSchema.index({ team_id: 1, conversation_id: 1, created_at: 1 });

export const ChatMessage = model<IChatMessage>('ChatMessage', chatMessageSchema, 'chat_messages');
