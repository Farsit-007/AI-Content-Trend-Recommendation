"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.classifyIntent = void 0;
const NEWS_KEYWORDS = [
    'news', 'trend', 'trending', 'opportunity', 'post about', 'what should i post',
    'what to create', 'what to post', 'topic', 'category',
    'খবর', 'ট্রেন্ড', 'ট্রেন্ডিং', 'কী নিয়ে', 'কি নিয়ে',
];
const PERFORMANCE_KEYWORDS = [
    'facebook', 'fb', 'youtube', 'linkedin', 'instagram', 'twitter',
    'reach', 'engagement', 'engagement rate', 'views', 'watch time', 'performance', 'analytics',
    'ফেসবুক', 'ইউটিউব', 'পারফরম্যান্স',
];
/** Pure keyword match, no Mongo/LLM — defaults to both when neither matches so retrieval never runs empty. */
const classifyIntent = (question) => {
    const lower = question.toLowerCase();
    const news = NEWS_KEYWORDS.some((k) => lower.includes(k));
    const performance = PERFORMANCE_KEYWORDS.some((k) => lower.includes(k));
    if (!news && !performance)
        return { news: true, performance: true };
    return { news, performance };
};
exports.classifyIntent = classifyIntent;
