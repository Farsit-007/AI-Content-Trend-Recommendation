"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.decrypt = exports.encrypt = void 0;
const crypto_1 = __importDefault(require("crypto"));
const config_1 = require("../config");
const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const VERSION = 'v1';
/**
 * Encrypts a platform token for storage. Output is self-describing and versioned
 * (`v1:<iv>:<authTag>:<ciphertext>`, all base64) so the scheme can be rotated later
 * without having to guess how existing rows were encrypted.
 */
const encrypt = (plaintext) => {
    const iv = crypto_1.default.randomBytes(IV_BYTES);
    const cipher = crypto_1.default.createCipheriv(ALGORITHM, config_1.credentialEncryptionKey, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return [VERSION, iv.toString('base64'), authTag.toString('base64'), ciphertext.toString('base64')].join(':');
};
exports.encrypt = encrypt;
/**
 * Reverses `encrypt`. Throws if the payload was tampered with — GCM's auth tag is
 * verified on `final()`, so a modified ciphertext fails loudly instead of yielding
 * corrupted plaintext that would later be sent to a platform API as a bearer token.
 */
const decrypt = (payload) => {
    const parts = payload.split(':');
    if (parts.length !== 4 || parts[0] !== VERSION) {
        throw new Error('Malformed encrypted payload');
    }
    const [, ivB64, authTagB64, ciphertextB64] = parts;
    const decipher = crypto_1.default.createDecipheriv(ALGORITHM, config_1.credentialEncryptionKey, Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(authTagB64, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(ciphertextB64, 'base64')), decipher.final()]).toString('utf8');
};
exports.decrypt = decrypt;
