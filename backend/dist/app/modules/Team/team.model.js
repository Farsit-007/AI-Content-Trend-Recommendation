"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TeamMembership = exports.Team = void 0;
const mongoose_1 = require("mongoose");
const voiceProfileSchema = new mongoose_1.Schema({
    default_language: {
        type: String,
        enum: ['bangla', 'english', 'banglish'],
        default: 'bangla',
    },
    custom_instructions: { type: String, trim: true, maxlength: 500 },
}, { _id: false });
const teamSchema = new mongoose_1.Schema({
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    created_by: { type: String, required: true },
    custom_categories: { type: [String], default: [] },
    voice_profile: { type: voiceProfileSchema, default: () => ({}) },
    created_at: { type: Date, default: Date.now },
});
exports.Team = (0, mongoose_1.model)('Team', teamSchema, 'teams');
const teamMembershipSchema = new mongoose_1.Schema({
    team_id: { type: String, required: true },
    user_id: { type: String, required: true },
    created_at: { type: Date, default: Date.now },
});
// A user can only be added to a given team once; membership rows are looked up from both sides.
teamMembershipSchema.index({ team_id: 1, user_id: 1 }, { unique: true });
teamMembershipSchema.index({ user_id: 1 });
exports.TeamMembership = (0, mongoose_1.model)('TeamMembership', teamMembershipSchema, 'team_memberships');
