"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildMessages = void 0;
const voiceProfile_1 = require("../../lib/voiceProfile");
const buildSystemPrompt = (voiceOptions) => 'You are the "Ask Growth Studio" assistant for a social media growth marketing team. ' +
    "You answer questions about trending news/topics relevant to the team's content, the team's own " +
    "platform performance (Facebook, YouTube, LinkedIn, etc.), and what content to create next. " +
    'Ground every answer in the context provided below — do not invent statistics or news that is not in the context. ' +
    'If the context does not contain enough information to answer precisely, say so and offer the closest relevant ' +
    'recommendation from what is available. ' +
    'Keep a warm, concise, actionable tone — this is a coworker, not a formal report. ' +
    `Reply language: ${(0, voiceProfile_1.languageInstruction)(voiceOptions.language)} ` +
    'If the user clearly writes in a different language, you may mirror their language instead.' +
    (voiceOptions.custom_instructions
        ? `\nTeam instructions (always follow these): ${voiceOptions.custom_instructions}`
        : '');
const formatContext = (context) => {
    if (context.length === 0)
        return 'No specific context was retrieved for this question.';
    return context.map((item, i) => `${i + 1}. [${item.source}]\n${item.content}`).join('\n\n');
};
const buildMessages = (question, context, history, voiceOptions) => [
    { role: 'system', content: `${buildSystemPrompt(voiceOptions)}\n\nContext:\n${formatContext(context)}` },
    ...history.map((msg) => ({ role: msg.role, content: msg.content })),
    { role: 'user', content: question },
];
exports.buildMessages = buildMessages;
