import crypto from 'crypto';
import { credentialEncryptionKey } from '../config';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const VERSION = 'v1';

/**
 * Encrypts a secret (platform token, LLM provider API key, etc.) for storage. Output is
 * self-describing and versioned (`v1:<iv>:<authTag>:<ciphertext>`, all base64) so the scheme can
 * be rotated later without having to guess how existing rows were encrypted.
 */
export const encrypt = (plaintext: string): string => {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, credentialEncryptionKey, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [VERSION, iv.toString('base64'), authTag.toString('base64'), ciphertext.toString('base64')].join(':');
};

/**
 * Reverses `encrypt`. Throws if the payload was tampered with — GCM's auth tag is
 * verified on `final()`, so a modified ciphertext fails loudly instead of yielding
 * corrupted plaintext that would later be sent to a platform API as a bearer token.
 */
export const decrypt = (payload: string): string => {
  const parts = payload.split(':');
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error('Malformed encrypted payload');
  }

  const [, ivB64, authTagB64, ciphertextB64] = parts;
  const decipher = crypto.createDecipheriv(ALGORITHM, credentialEncryptionKey, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(authTagB64, 'base64'));

  return Buffer.concat([decipher.update(Buffer.from(ciphertextB64, 'base64')), decipher.final()]).toString('utf8');
};
