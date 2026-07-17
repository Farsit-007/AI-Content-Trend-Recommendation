"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatValidation = void 0;
const zod_1 = require("zod");
const objectId = zod_1.z.string().regex(/^[0-9a-fA-F]{24}$/, 'must be a valid MongoDB ObjectId');
const askChatValidation = zod_1.z.object({
    body: zod_1.z.object({
        team_id: objectId,
        message: zod_1.z.string({ required_error: 'message is required' }).min(1, 'message is required'),
        conversation_id: zod_1.z.string().optional(),
        language: zod_1.z.enum(['bangla', 'english', 'banglish']).optional(),
    }),
});
exports.ChatValidation = {
    askChatValidation,
};
