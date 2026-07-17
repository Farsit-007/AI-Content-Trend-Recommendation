"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.stripHtml = exports.decodeEntities = void 0;
const decodeEntities = (text) => text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
exports.decodeEntities = decodeEntities;
const stripHtml = (html) => html.replace(/<[^>]+>/g, '');
exports.stripHtml = stripHtml;
