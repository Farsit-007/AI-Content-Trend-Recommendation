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
exports.mockAdapter = void 0;
const TOPICS = [
    'React 19 নিয়ে নতুন আপডেট এসেছে',
    'AI দিয়ে কোড লেখা আরো সহজ হয়ে গেছে',
    'Node.js performance tips for beginners',
    'JavaScript এ async/await কিভাবে কাজ করে',
    'Python machine learning tutorial',
    'Career in web development 2026',
    'TypeScript কেন শেখা উচিত',
    'Docker basics explained in Bangla',
    'MongoDB vs PostgreSQL comparison',
    'GitHub Actions CI/CD setup guide',
];
const FORMATS = ['video', 'post', 'reel', 'article', 'short'];
const seededRandom = (seed) => {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
};
const seededInt = (seed, min, max) => Math.floor(seededRandom(seed) * (max - min + 1)) + min;
const hashString = (s) => {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
        h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
    }
    return Math.abs(h);
};
const mockAdapter = (teamId, platform) => __awaiter(void 0, void 0, void 0, function* () {
    const seed = hashString(`${teamId}:${platform}`);
    const postCount = seededInt(seed, 15, 30);
    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
    const posts = Array.from({ length: postCount }, (_, i) => {
        const s = seed + i * 17;
        const topicIdx = seededInt(s, 0, TOPICS.length - 1);
        const formatIdx = seededInt(s + 1, 0, FORMATS.length - 1);
        const daysAgo = seededInt(s + 2, 1, 30);
        const published_at = new Date(thirtyDaysAgo + daysAgo * 24 * 60 * 60 * 1000);
        const reach = seededInt(s + 3, 500, 15000);
        const likes = seededInt(s + 4, 20, Math.floor(reach * 0.15));
        const comments = seededInt(s + 5, 5, Math.floor(reach * 0.05));
        const shares = seededInt(s + 6, 2, Math.floor(reach * 0.03));
        const views = platform === 'youtube' ? seededInt(s + 7, 1000, 50000) : reach;
        return {
            post_id: `mock_${platform}_${teamId}_${i}`,
            content_snippet: TOPICS[topicIdx],
            metrics: { reach, likes, comments, shares, views },
            published_at,
            format: FORMATS[formatIdx],
        };
    });
    return { status: 'ok', posts };
});
exports.mockAdapter = mockAdapter;
