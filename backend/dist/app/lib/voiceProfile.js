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
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveVoiceOptions = exports.languageInstruction = void 0;
const team_model_1 = require("../modules/Team/team.model");
const LANGUAGE_INSTRUCTIONS = {
    bangla: 'Write in Bengali (বাংলা script). Keep widely-used English technical terms ' +
        '(e.g. AI, JavaScript, framework, API) in English, as Bangla tech content naturally does. ' +
        'Never write Bengali words in Latin letters.',
    banglish: 'Write in Banglish — Bengali written in Latin letters, mixed naturally with English technical terms.',
    english: 'Write in clear, natural English.',
};
const languageInstruction = (language) => LANGUAGE_INSTRUCTIONS[language];
exports.languageInstruction = languageInstruction;
const resolveVoiceOptions = (teamId, languageOverride) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const team = yield team_model_1.Team.findById(teamId).catch(() => null);
    const profile = team === null || team === void 0 ? void 0 : team.voice_profile;
    return {
        language: (_a = languageOverride !== null && languageOverride !== void 0 ? languageOverride : profile === null || profile === void 0 ? void 0 : profile.default_language) !== null && _a !== void 0 ? _a : 'bangla',
        custom_instructions: (profile === null || profile === void 0 ? void 0 : profile.custom_instructions) || undefined,
    };
});
exports.resolveVoiceOptions = resolveVoiceOptions;
