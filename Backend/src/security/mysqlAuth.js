import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHmac } from 'node:crypto';
import { promisify } from 'node:util';
import { getMySqlPool } from '../config/mysql.js';

const scrypt = promisify(scryptCallback);
const TOKEN_TTL_SECONDS = 60 * 60 * 8;
const ALLOWED_ROLES = ['super_admin', 'business_admin', 'affiliate', 'finance_admin'];

export async function hashMySqlPassword(password) {
  if (typeof password !== 'string' || password.length < 12) {
    throw new Error('Password must contain at least 12 characters.');
  }
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, 64);
  return 'scrypt$' + salt.toString('hex') + '$' + derived.toString('hex');
}

export async function verifyMySqlPassword(password, storedHash) {
  if (typeof password !== 'string' || typeof storedHash !== 'string') return false;
  const parts = storedHash.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  try {
    const salt = Buffer.from(parts[1], 'hex');
    const expected = Buffer.from(parts[2], 'hex');
    if (salt.length !== 16 || expected.length !== 64) return false;
    const actual = await scrypt(password, salt, expected.length);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

function sign(value, secret) {
  return createHmac('sha256', secret).update(value).digest('base64url');
}

export function issueMySqlAccessToken(user, secret, now = Date.now()) {
  if (!secret || secret.length < 32) throw new Error('AUTH_TOKEN_SECRET must contain at least 32 characters.');
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    sub: String(user.id),
    role: user.role,
    businessId: user.business_id == null ? null : String(user.business_id),
    iat: Math.floor(now / 1000),
    exp: Math.floor(now / 1000) + TOKEN_TTL_SECONDS,
  })).toString('base64url');
  const unsigned = header + '.' + payload;
  return unsigned + '.' + sign(unsigned, secret);
}

export function readMySqlAccessToken(token, secret, now = Date.now()) {
  if (!secret || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const unsigned = parts[0] + '.' + parts[1];
  const expected = Buffer.from(sign(unsigned, secret));
  const supplied = Buffer.from(parts[2]);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;
  try {
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (!claims.sub || !ALLOWED_ROLES.includes(claims.role) || !Number.isInteger(claims.exp)) return null;
    if (claims.exp <= Math.floor(now / 1000)) return null;
    return claims;
  } catch {
    return null;
  }
}

export function createMySqlAuthenticate(secret) {
  return async (req, res, next) => {
    const authorization = req.get('authorization') || '';
    const match = /^Bearer\\s+(.+)$/i.exec(authorization);
    const claims = match ? readMySqlAccessToken(match[1], secret) : null;
    if (!claims) return res.status(401).json({ error: 'Authentication required.' });
    try {
      // Read current account state and permissions from MySQL on every request.
      // This immediately revokes access after suspension, disablement, or role changes.
      const [rows] = await getMySqlPool().execute(
        'SELECT id, business_id, role, status FROM users WHERE id=? LIMIT 1',
        [claims.sub],
      );
      const user = rows[0];
      if (!user || user.status !== 'active' || !ALLOWED_ROLES.includes(user.role)) {
        return res.status(401).json({ error: 'Your account is inactive. Please sign in again or contact an administrator.' });
      }
      req.auth = {
        ...claims,
        sub: String(user.id),
        role: user.role,
        businessId: user.business_id == null ? null : String(user.business_id),
      };
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

export function requireMySqlRoles(...roles) {
  return (req, res, next) => {
    if (!req.auth || !roles.includes(req.auth.role)) {
      return res.status(403).json({ error: 'You do not have permission to access this resource.' });
    }
    return next();
  };
}

export function requireBusinessScope(req, res, next) {
  if (req.auth?.role === 'super_admin') return next();
  const requestedBusinessId = req.params.businessId || req.body?.businessId || req.query?.businessId;
  if (!req.auth?.businessId || (requestedBusinessId && String(requestedBusinessId) !== req.auth.businessId)) {
    return res.status(403).json({ error: 'Business access is restricted to your assigned business.' });
  }
  return next();
}
