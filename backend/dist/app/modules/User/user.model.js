"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.User = void 0;
const mongoose_1 = require("mongoose");
const userSchema = new mongoose_1.Schema({
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    // Never returned by a query unless a caller explicitly re-selects it (login does).
    password_hash: { type: String, required: true, select: false },
    name: { type: String, required: true, trim: true },
    role: { type: String, enum: ['super_admin', 'admin', 'user'], default: 'user' },
    password_changed_at: { type: Date },
    created_at: { type: Date, default: Date.now },
}, {
    toJSON: {
        transform: (_doc, ret) => {
            delete ret.password_hash;
            return ret;
        },
    },
});
exports.User = (0, mongoose_1.model)('User', userSchema, 'users');
