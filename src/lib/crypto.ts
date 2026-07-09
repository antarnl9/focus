import crypto from 'node:crypto';
import { env } from './env';

// Cifrado AES-256-GCM para tokens OAuth en reposo (spec §8).
// Requiere TOKEN_ENCRYPTION_KEY = 32 bytes en hex (64 chars).

function key(): Buffer {
  const hex = env.tokenEncryptionKey;
  if (!hex || hex.length < 64) {
    throw new Error('TOKEN_ENCRYPTION_KEY debe ser 32 bytes en hex (64 chars). Genera con: openssl rand -hex 32');
  }
  return Buffer.from(hex.slice(0, 64), 'hex');
}

export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}.${tag.toString('base64')}.${enc.toString('base64')}`;
}

export function decrypt(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split('.');
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const data = Buffer.from(dataB64, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}
