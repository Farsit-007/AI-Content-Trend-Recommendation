import { decrypt, encrypt } from '../app/lib/crypto';

describe('crypto', () => {
  it('round-trips a plaintext string through encrypt/decrypt', () => {
    const plaintext = 'sk-ant-api03-super-secret-key-value';
    const encrypted = encrypt(plaintext);
    expect(decrypt(encrypted)).toBe(plaintext);
  });

  it('produces different ciphertext for the same plaintext on repeated calls (random IV)', () => {
    const plaintext = 'same-secret';
    const first = encrypt(plaintext);
    const second = encrypt(plaintext);
    expect(first).not.toBe(second);
    expect(decrypt(first)).toBe(plaintext);
    expect(decrypt(second)).toBe(plaintext);
  });

  it('is versioned and self-describing', () => {
    const encrypted = encrypt('some-key');
    const parts = encrypted.split(':');
    expect(parts).toHaveLength(4);
    expect(parts[0]).toBe('v1');
  });

  it('throws when the ciphertext has been tampered with', () => {
    const encrypted = encrypt('tamper-me');
    const [version, iv, authTag, ciphertext] = encrypted.split(':');
    const tampered = [version, iv, authTag, Buffer.from('tampered-bytes').toString('base64')].join(':');
    void ciphertext;
    expect(() => decrypt(tampered)).toThrow();
  });

  it('throws when the auth tag has been tampered with', () => {
    const encrypted = encrypt('tamper-me-too');
    const [version, iv, , ciphertext] = encrypted.split(':');
    const tampered = [version, iv, Buffer.from('bad-auth-tag-16b').toString('base64'), ciphertext].join(':');
    expect(() => decrypt(tampered)).toThrow();
  });

  it('throws on a malformed payload (wrong segment count)', () => {
    expect(() => decrypt('not-a-valid-payload')).toThrow('Malformed encrypted payload');
    expect(() => decrypt('v1:only:two')).toThrow('Malformed encrypted payload');
  });

  it('throws on a payload with an unrecognized version prefix', () => {
    const encrypted = encrypt('versioned-secret');
    const parts = encrypted.split(':');
    parts[0] = 'v2';
    expect(() => decrypt(parts.join(':'))).toThrow('Malformed encrypted payload');
  });

  it('round-trips an empty string', () => {
    const encrypted = encrypt('');
    expect(decrypt(encrypted)).toBe('');
  });

  it('round-trips a long, non-ASCII plaintext', () => {
    const plaintext = 'শুভ সকাল — সব ঠিক আছে? '.repeat(50);
    const encrypted = encrypt(plaintext);
    expect(decrypt(encrypted)).toBe(plaintext);
  });
});
