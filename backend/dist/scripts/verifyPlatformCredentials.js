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
 * Proves a team's platform credential authenticates — nothing more.
 * Credentials are now team-owned (added via the frontend), not .env bootstrap tokens.
 *
 * Run: npm run verify:credentials -- <team_id>
 */
const mongoose_1 = __importDefault(require("mongoose"));
const platformCredentials_1 = require("../app/lib/platformCredentials");
const config_1 = __importDefault(require("../app/config"));
const identityUrl = (platform, token) => {
    switch (platform) {
        case 'facebook':
            return `https://graph.facebook.com/v21.0/me?fields=id,name&access_token=${encodeURIComponent(token)}`;
        case 'youtube':
            return `https://www.googleapis.com/youtube/v3/channels?part=id&${config_1.default.platforms.youtube.accountId
                ? `id=${encodeURIComponent(config_1.default.platforms.youtube.accountId)}`
                : 'forHandle=@youtube'}&key=${encodeURIComponent(token)}`;
        case 'linkedin':
            return 'https://api.linkedin.com/v2/me';
    }
};
const verify = (platform, teamId) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    if (!(yield (0, platformCredentials_1.isPlatformConfigured)(platform, teamId))) {
        return {
            outcome: 'SKIP',
            detail: 'not configured (team has not added credentials for this platform)',
        };
    }
    const token = yield (0, platformCredentials_1.getPlatformToken)(platform, teamId);
    if (!token) {
        return { outcome: 'SKIP', detail: 'no credential found' };
    }
    const headers = platform === 'linkedin' ? { Authorization: `Bearer ${token}` } : {};
    try {
        const res = yield fetch(identityUrl(platform, token), { headers });
        const body = (yield res.json());
        if (!res.ok) {
            const providerError = JSON.stringify((_a = body.error) !== null && _a !== void 0 ? _a : body);
            return { outcome: 'FAIL', detail: `HTTP ${res.status} — ${providerError}` };
        }
        return { outcome: 'PASS', detail: `authenticated as ${JSON.stringify((_c = (_b = body.name) !== null && _b !== void 0 ? _b : body.id) !== null && _c !== void 0 ? _c : body)}` };
    }
    catch (err) {
        return { outcome: 'FAIL', detail: err.message };
    }
});
const main = () => __awaiter(void 0, void 0, void 0, function* () {
    const teamId = process.argv[2];
    if (!teamId) {
        console.error('Usage: npm run verify:credentials -- <team_id>');
        process.exit(1);
    }
    yield mongoose_1.default.connect(config_1.default.database_url);
    console.log(`Verifying platform credentials for team: ${teamId}\n`);
    const results = {};
    for (const platform of platformCredentials_1.KNOWN_PLATFORMS) {
        const { outcome, detail } = yield verify(platform, teamId);
        results[platform] = outcome;
        console.log(`  ${outcome.padEnd(4)} ${platform.padEnd(9)} ${detail}`);
    }
    yield mongoose_1.default.disconnect();
    const failed = Object.entries(results).filter(([, outcome]) => outcome === 'FAIL');
    console.log(failed.length
        ? `\n${failed.length} platform(s) FAILED: ${failed.map(([p]) => p).join(', ')}`
        : '\nNo failures. (SKIP = team has not added credentials yet.)');
    process.exit(failed.length ? 1 : 0);
});
main().catch((err) => {
    console.error('Verification script crashed:', err);
    process.exit(1);
});
