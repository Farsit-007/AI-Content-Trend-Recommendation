"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildMessages = exports.buildUserPrompt = exports.buildSystemPrompt = void 0;
const voiceProfile_1 = require("../../lib/voiceProfile");
const RESPONSE_SHAPE_INSTRUCTION = 'Respond with ONLY a strict JSON object, no markdown fences, no commentary. It must have exactly these keys: ' +
    '{ "facebook_post": "<string>", "facebook_reel_script": "<string>", "linkedin_post": "<string>", ' +
    '"youtube_idea": { "title": "<string>", "hook": "<string>", "chapters": ["<string>", ...], "thumbnail_concept": "<string>" }, ' +
    '"caption": "<string>" }. Do not include a "topic" key.';
const GROUNDING_INSTRUCTION = 'When source context (a snippet and/or "why it matters" note) is provided below, ground your factual claims in ' +
    'that material and stay faithful to it — do not invent specific facts, numbers, quotes, features, or dates beyond ' +
    'what is given. If the provided context is thin, write more generally about the topic rather than fabricating specifics.';
const formatExamples = (examples) => examples
    .map((example, i) => {
    const hint = example.engagement_hint ? ` (engagement: ${example.engagement_hint})` : '';
    return `${i + 1}. [${example.source}]${hint}\n${example.content}`;
})
    .join('\n\n');
const buildSystemPrompt = (fewShotExamples, voiceOptions) => {
    const voiceInstructions = `Language: ${(0, voiceProfile_1.languageInstruction)(voiceOptions.language)}` +
        (voiceOptions.custom_instructions
            ? `\nTeam instructions (always follow these): ${voiceOptions.custom_instructions}`
            : '');
    if (fewShotExamples.length === 0) {
        return ('You are a social media content generator for a growth marketing team. ' +
            'Write engaging, platform-appropriate content in a clear, professional, brand-neutral tone — ' +
            'this team has not yet submitted brand-voice examples, so do not invent a specific persona or slang.\n\n' +
            `${voiceInstructions}\n\n` +
            `${GROUNDING_INSTRUCTION}\n\n` +
            RESPONSE_SHAPE_INSTRUCTION);
    }
    return ('You are a social media content generator for a growth marketing team. ' +
        "Match the team's own voice, tone, and style shown in the examples below — these are real examples of how " +
        'this team writes, including past posts and their performance. Study word choice, tone, formatting, emoji use, ' +
        'and structure, then write new content that reads as if the same team wrote it.\n\n' +
        `${voiceInstructions}\n\n` +
        `Brand voice examples:\n${formatExamples(fewShotExamples)}\n\n` +
        `${GROUNDING_INSTRUCTION}\n\n` +
        RESPONSE_SHAPE_INSTRUCTION);
};
exports.buildSystemPrompt = buildSystemPrompt;
const buildUserPrompt = (topic, newsContext) => {
    if (!newsContext ||
        (!newsContext.category && !newsContext.impact_note && !newsContext.snippet && !newsContext.url)) {
        return `Generate content about: "${topic}"`;
    }
    const contextParts = [
        newsContext.category ? `category: ${newsContext.category}` : null,
        newsContext.impact_note ? `why it matters: ${newsContext.impact_note}` : null,
        newsContext.snippet ? `source snippet: "${newsContext.snippet}"` : null,
        newsContext.url ? `source: ${newsContext.url}` : null,
    ].filter(Boolean);
    return `Generate content about: "${topic}"\n\nAdditional context (${contextParts.join('; ')})`;
};
exports.buildUserPrompt = buildUserPrompt;
const buildMessages = (topic, fewShotExamples, voiceOptions, newsContext) => [
    { role: 'system', content: (0, exports.buildSystemPrompt)(fewShotExamples, voiceOptions) },
    { role: 'user', content: (0, exports.buildUserPrompt)(topic, newsContext) },
];
exports.buildMessages = buildMessages;
