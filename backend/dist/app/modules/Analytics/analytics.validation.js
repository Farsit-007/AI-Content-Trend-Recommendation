"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnalyticsValidation = void 0;
const zod_1 = require("zod");
const getAnalyticsValidation = zod_1.z.object({
    query: zod_1.z.object({
        team_id: zod_1.z.string({ required_error: 'team_id is required' }),
    }),
});
const refreshAnalyticsValidation = zod_1.z.object({
    body: zod_1.z.object({
        team_id: zod_1.z.string().optional(),
    }).optional(),
});
exports.AnalyticsValidation = {
    getAnalyticsValidation,
    refreshAnalyticsValidation,
};
