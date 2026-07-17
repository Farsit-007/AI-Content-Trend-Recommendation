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
/**
 * Seeds a team's brand_voice_examples from a JSON file of real posts. These examples are
 * what personalize every LLM output for the team (few-shot retrieval in content generation) —
 * seed 25–30 real high-engagement posts in the team's actual language/style (Bangla script,
 * English, or mixed) covering the main categories.
 *
 * Run: npm run seed:brand-voice -- <team_id> <path/to/posts.json>
 * JSON shape: [{ "platform": "facebook", "category": "AI", "content": "...", "engagement_hint": "2.4k likes" }]
 * (see seed/brand-voice.example.json)
 *
 * Idempotent: an example whose exact content already exists for the team is skipped, so the
 * script can be re-run after adding new posts to the file.
 */
const fs_1 = require("fs");
const mongoose_1 = __importDefault(require("mongoose"));
const zod_1 = require("zod");
const config_1 = __importDefault(require("../app/config"));
const embeddings_1 = require("../app/lib/embeddings");
const brandVoiceExample_model_1 = require("../app/modules/BrandVoiceExample/brandVoiceExample.model");
const team_model_1 = require("../app/modules/Team/team.model");
const seedFileSchema = zod_1.z
    .array(zod_1.z.object({
    platform: zod_1.z.string().trim().min(1),
    category: zod_1.z.string().trim().min(1).optional(),
    content: zod_1.z.string().trim().min(1),
    engagement_hint: zod_1.z.string().trim().optional(),
}))
    .min(1);
const [, , teamId, filePath] = process.argv;
const main = () => __awaiter(void 0, void 0, void 0, function* () {
    if (!teamId || !filePath) {
        console.error('Usage: npm run seed:brand-voice -- <team_id> <path/to/posts.json>');
        process.exit(1);
    }
    const parsed = seedFileSchema.safeParse(JSON.parse((0, fs_1.readFileSync)(filePath, 'utf8')));
    if (!parsed.success) {
        console.error('[seedBrandVoice] invalid seed file:', parsed.error.issues);
        process.exit(1);
    }
    const posts = parsed.data;
    yield mongoose_1.default.connect(config_1.default.database_url);
    const team = yield team_model_1.Team.findById(teamId);
    if (!team) {
        console.error(`[seedBrandVoice] team "${teamId}" not found`);
        yield mongoose_1.default.disconnect();
        process.exit(1);
    }
    let created = 0;
    let skipped = 0;
    for (const post of posts) {
        const exists = yield brandVoiceExample_model_1.BrandVoiceExample.exists({ team_id: teamId, content: post.content });
        if (exists) {
            skipped += 1;
            continue;
        }
        const embedding = yield (0, embeddings_1.embed)(post.content);
        yield brandVoiceExample_model_1.BrandVoiceExample.create(Object.assign(Object.assign({}, post), { team_id: teamId, embedding, added_by: 'seed-script' }));
        created += 1;
    }
    const total = yield brandVoiceExample_model_1.BrandVoiceExample.countDocuments({ team_id: teamId });
    console.log(`[seedBrandVoice] team "${team.name}": ${created} created, ${skipped} skipped (already present), ${total} total examples`);
    if (total < 25) {
        console.log(`[seedBrandVoice] tip: aim for 25–30 examples across your main categories for reliable voice matching (currently ${total})`);
    }
    yield mongoose_1.default.disconnect();
});
main().catch((err) => {
    console.error('[seedBrandVoice] failed:', err instanceof Error ? err.message : err);
    process.exit(1);
});
