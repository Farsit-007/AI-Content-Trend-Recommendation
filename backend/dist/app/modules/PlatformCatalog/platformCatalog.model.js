"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TeamPlatform = exports.PlatformCatalog = void 0;
const mongoose_1 = require("mongoose");
const platformCatalogSchema = new mongoose_1.Schema({
    name: { type: String, required: true, lowercase: true, trim: true },
    label: { type: String, trim: true },
    is_enabled: { type: Boolean, default: true },
    created_by: { type: String, required: true },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
});
platformCatalogSchema.index({ name: 1 }, { unique: true });
exports.PlatformCatalog = (0, mongoose_1.model)('PlatformCatalog', platformCatalogSchema, 'platform_catalog');
const teamPlatformSchema = new mongoose_1.Schema({
    team_id: { type: String, required: true },
    platform: { type: String, required: true, lowercase: true, trim: true },
    is_enabled: { type: Boolean, default: true },
    enabled_by: { type: String, required: true },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
});
// One switch per (team, platform) — re-enabling/disabling flips this row rather than duplicating it.
teamPlatformSchema.index({ team_id: 1, platform: 1 }, { unique: true });
exports.TeamPlatform = (0, mongoose_1.model)('TeamPlatform', teamPlatformSchema, 'team_platforms');
