"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isKnownPlatform = exports.KNOWN_PLATFORMS = void 0;
exports.KNOWN_PLATFORMS = ['facebook', 'youtube', 'linkedin'];
const isKnownPlatform = (platform) => exports.KNOWN_PLATFORMS.includes(platform);
exports.isKnownPlatform = isKnownPlatform;
