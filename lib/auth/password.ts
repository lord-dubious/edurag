import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'crypto';
import { promisify } from 'util';

const scrypt = promisify(scryptCallback);

export async function hashPassword(password: string): Promise<{ passwordHash: string; passwordSalt: string }> {
  const passwordSalt = randomBytes(16).toString('hex');
  const derived = await scrypt(password, passwordSalt, 64) as Buffer;
  return {
    passwordHash: derived.toString('hex'),
    passwordSalt,
  };
}

export async function verifyPassword(password: string, passwordSalt: string, passwordHash: string): Promise<boolean> {
  const derived = await scrypt(password, passwordSalt, 64) as Buffer;
  const stored = Buffer.from(passwordHash, 'hex');
  if (stored.length !== derived.length) {
    return false;
  }
  return timingSafeEqual(stored, derived);
}
