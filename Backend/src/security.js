import {
  createHmac,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const TOKEN_LIFETIME_SECONDS = 60 * 60 * 12;

export async function hashPassword(password) {
  if (typeof password !== 'string' || password.length === 0) {
    throw new TypeError('Password must be a non-empty string.');
  }

  const salt = randomBytes(16).toString('hex');
  const derivedKey = await scrypt(password, salt, 64);
  return `${salt}:${derivedKey.toString('hex')}`;
}

export async function verifyPassword(password, passwordHash) {
  if (typeof password !== 'string' || typeof passwordHash !== 'string') {
    return false;
  }

  const [salt, storedKey] = passwordHash.split(':');
  if (!salt || !storedKey) return false;

  try {
    const expected = Buffer.from(storedKey, 'hex');
    const actual = await scrypt(password, salt, expected.length);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function createAccessToken(userId, secret, tokenVersion = 0) {
  if (typeof userId !== 'string' || !userId || typeof secret !== 'string' || !secret) {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(
    JSON.stringify({ sub: userId, iat: now, exp: now + TOKEN_LIFETIME_SECONDS, ver: tokenVersion })
  ).toString('base64url');
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export function readAccessToken(token, secret) {
  if (typeof token !== 'string' || typeof secret !== 'string') {
    return null;
  }

  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra) return null;

  try {
    const expected = createHmac('sha256', secret).update(payload).digest();
    let provided;
    try {
      provided = Buffer.from(signature, 'base64url');
    } catch {
      return null;
    }
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;

    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (typeof claims.sub !== 'string' || !Number.isFinite(claims.exp) || claims.exp <= Date.now() / 1000) {
      return null;
    }
    return claims;
  } catch {
    return null;
  }
}
