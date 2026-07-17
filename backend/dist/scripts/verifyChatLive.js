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
const dns_1 = __importDefault(require("dns"));
const mongoose_1 = __importDefault(require("mongoose"));
const config_1 = __importDefault(require("../app/config"));
dns_1.default.setServers(['8.8.8.8', '1.1.1.1']);
const newsItem_model_1 = require("../app/modules/NewsItem/newsItem.model");
const platformPost_model_1 = require("../app/modules/PlatformPost/platformPost.model");
const team_model_1 = require("../app/modules/Team/team.model");
const chat_model_1 = require("../app/modules/Chat/chat.model");
const chat_service_1 = require("../app/modules/Chat/chat.service");
let failures = 0;
const check = (name, condition) => {
    if (!condition) {
        failures++;
        console.error(`FAIL: ${name}`);
    }
    else {
        console.log(`PASS: ${name}`);
    }
};
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        yield mongoose_1.default.connect(config_1.default.database_url);
        const team = yield team_model_1.Team.findOne({});
        if (!team) {
            console.error('No Team documents found — seed a team before running this live check.');
            process.exit(1);
        }
        const teamId = team._id.toString();
        console.log(`Using team: ${teamId} (${(_a = team.name) !== null && _a !== void 0 ? _a : 'unnamed'})`);
        const requestingUser = { id: 'live-verify-user', email: 'live-verify@example.com', role: 'user', team_ids: [teamId] };
        const newsCount = yield newsItem_model_1.NewsItem.countDocuments({});
        const postCount = yield platformPost_model_1.PlatformPost.countDocuments({ team_id: teamId });
        console.log(`NewsItem docs: ${newsCount}, PlatformPost docs for team: ${postCount}`);
        // 1. Trend-shaped question
        const trendResult = yield chat_service_1.ChatService.askChat({ team_id: teamId, message: 'এই সপ্তাহে কোন news trending আছে?' }, requestingUser);
        check('trend question returns a non-empty reply', trendResult.reply.trim().length > 0);
        console.log(`  reply: ${trendResult.reply.slice(0, 200)}...`);
        // 2. Performance-shaped question, follow-up in the same conversation
        const perfResult = yield chat_service_1.ChatService.askChat({ team_id: teamId, message: 'আমাদের Facebook performance কেমন?' }, requestingUser);
        check('performance question returns a non-empty reply', perfResult.reply.trim().length > 0);
        const followUp = yield chat_service_1.ChatService.askChat({ team_id: teamId, message: 'সেই সপ্তাহের সেরা পোস্টটা আবার বলো', conversation_id: perfResult.conversation_id }, requestingUser);
        check('follow-up reuses the same conversation_id', followUp.conversation_id === perfResult.conversation_id);
        const threadMessages = yield chat_model_1.ChatMessage.find({ team_id: teamId, conversation_id: perfResult.conversation_id }).sort({
            created_at: 1,
        });
        check('conversation thread persisted 4 turns (2 user + 2 assistant)', threadMessages.length === 4);
        // 3. Ambiguous question (no news/performance keywords) still gets a grounded, non-empty reply
        const ambiguousResult = yield chat_service_1.ChatService.askChat({ team_id: teamId, message: 'আজকে কী করবো?' }, requestingUser);
        check('ambiguous question returns a non-empty reply', ambiguousResult.reply.trim().length > 0);
        // 4. Cross-team conversation_id isolation — reuse team A's conversation_id under a different team
        const otherTeam = yield team_model_1.Team.findOne({ _id: { $ne: team._id } });
        if (otherTeam) {
            const otherTeamId = otherTeam._id.toString();
            const otherUser = { id: 'live-verify-user-2', email: 'live-verify-2@example.com', role: 'user', team_ids: [otherTeamId] };
            yield chat_service_1.ChatService.askChat({ team_id: otherTeamId, message: 'hello from another team', conversation_id: perfResult.conversation_id }, otherUser);
            const teamAHistory = yield chat_model_1.ChatMessage.find({ team_id: teamId, conversation_id: perfResult.conversation_id });
            const teamBHistory = yield chat_model_1.ChatMessage.find({ team_id: otherTeamId, conversation_id: perfResult.conversation_id });
            check('reusing another team\'s conversation_id does not merge histories', teamAHistory.length === 4 && teamBHistory.length === 2);
        }
        else {
            console.log('Only one Team document exists — skipping cross-team isolation check.');
        }
        yield mongoose_1.default.disconnect();
        if (failures > 0) {
            console.error(`\n${failures} check(s) failed.`);
            process.exit(1);
        }
        console.log('\nAll live chat checks passed.');
    });
}
main().catch((err) => {
    console.error(err);
    process.exit(1);
});
