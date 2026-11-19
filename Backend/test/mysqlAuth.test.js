import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hashMySqlPassword,
  verifyMySqlPassword,
  issueMySqlAccessToken,
  readMySqlAccessToken,
} from '../src/security/mysqlAuth.js';

const secret = 'test-only-secret-that-is-at-least-32-characters-long';
const user = { id: 42, role: 'affiliate', business_id: 7 };

test('password hashes verify without storing the original password', async () => {
  const password = 'Strong-Test-Password-2026';
  const hash = await hashMySqlPassword(password);
  assert.match(hash, /^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/);
  assert.equal(await verifyMySqlPassword(password, hash), true);
  assert.equal(await verifyMySqlPassword('wrong-password', hash), false);
});

test('password hashing rejects weak passwords', async () => {
  await assert.rejects(() => hashMySqlPassword('short'), /at least 12 characters/);
});

test('signed access tokens preserve subject, role and business scope', () => {
  const now = 1_800_000_000_000;
  const token = issueMySqlAccessToken(user, secret, now);
  assert.deepEqual(readMySqlAccessToken(token, secret, now), {
    sub: '42',
    role: 'affiliate',
    businessId: '7',
    iat: 1_800_000_000,
    exp: 1_800_028_800,
  });
});

test('access tokens reject tampering, expiry and invalid roles', () => {
  const now = 1_800_000_000_000;
  const token = issueMySqlAccessToken(user, secret, now);
  assert.equal(readMySqlAccessToken(token + 'x', secret, now), null);
  assert.equal(readMySqlAccessToken(token, secret, now + 28_800_000), null);

  const invalidRoleToken = issueMySqlAccessToken({ ...user, role: 'cashier' }, secret, now);
  assert.equal(readMySqlAccessToken(invalidRoleToken, secret, now), null);
});
