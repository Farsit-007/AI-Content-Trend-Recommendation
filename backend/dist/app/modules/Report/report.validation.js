"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReportValidation = void 0;
const zod_1 = require("zod");
const getReportValidation = zod_1.z.object({
    query: zod_1.z.object({
        team_id: zod_1.z.string({ required_error: 'team_id is required' }),
        refresh: zod_1.z.enum(['true', 'false']).optional(),
    }),
});
exports.ReportValidation = {
    getReportValidation,
};
