import { Router } from 'express';
import { createHash, randomInt } from 'node:crypto';
import { createTransport } from 'nodemailer';
import { getMySqlPool } from '../config/mysql.js';
import {
  createMySqlAuthenticate,
  issueMySqlAccessToken,
  verifyMySqlPassword,
  hashMySqlPassword,
} from '../security/mysqlAuth.js';

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 8;
const loginAttempts = new Map();

function consumeLoginAttempt(req, email) {
  const now = Date.now();
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const key = createHash('sha256').update(ip + ':' + email).digest('hex');
  const current = loginAttempts.get(key);
  if (current && now - current.startedAt < LOGIN_WINDOW_MS) {
    if (current.count >= LOGIN_MAX_ATTEMPTS) return false;
    current.count += 1;
  } else {
    loginAttempts.set(key, { startedAt: now, count: 1 });
  }
  if (loginAttempts.size > 10000) {
    for (const [entryKey, entry] of loginAttempts) {
      if (now - entry.startedAt >= LOGIN_WINDOW_MS) loginAttempts.delete(entryKey);
    }
  }
  return true;
}

export function createMySqlAuthRouter(secret) {
  const router = Router();
  const authenticate = createMySqlAuthenticate(secret);


  const mailer = process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS
    ? createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: process.env.SMTP_SECURE === 'true',
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      })
    : null;

  async function issueVerificationCode(connection, userId, email, fullName) {
    if (!mailer) throw new Error('Email verification is not configured on the server.');
    const code = String(randomInt(100000, 1000000));
    const codeHash = createHash('sha256').update(code).digest('hex');
    await connection.execute(
      "INSERT INTO email_verification_codes (user_id, code_hash, expires_at, resend_after) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 10 MINUTE), DATE_ADD(NOW(), INTERVAL 60 SECOND)) ON DUPLICATE KEY UPDATE code_hash = VALUES(code_hash), expires_at = VALUES(expires_at), resend_after = VALUES(resend_after), attempts = 0",
      [userId, codeHash],
    );
    await mailer.sendMail({
      from: process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER,
      to: email,
      subject: 'Verify your SAFI SALI COMPANIES account',
      text: 'Hello ' + fullName + ', your email verification code is ' + code + '. It expires in 10 minutes.',
    });
  }

  router.post('/register', async (req, res, next) => {
    const connection = await getMySqlPool().getConnection();
    try {
      const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
      const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
      const phone = typeof req.body?.phone === 'string' ? req.body.phone.trim() : '';
      const password = typeof req.body?.password === 'string' ? req.body.password : '';
      if (name.length < 2 || name.length > 160 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 190 || password.length < 12 || phone.length > 40) {
        return res.status(400).json({ error: 'Enter a valid name, email, phone number, and password of at least 12 characters.' });
      }
      if (!mailer) return res.status(503).json({ error: 'Email verification is not configured on the server.' });
      const passwordHash = await hashMySqlPassword(password);
      const slugBase = name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 140) || 'business';
      await connection.beginTransaction();
      const [existing] = await connection.execute('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);
      if (existing.length) {
        await connection.rollback();
        return res.status(409).json({ error: 'An account with this email already exists.' });
      }
      const [businessResult] = await connection.execute(
        'INSERT INTO businesses (name, slug, status) VALUES (?, ?, ?)',
        [name, slugBase + '-' + Date.now().toString(36), 'pending'],
      );
      const [userResult] = await connection.execute(
        'INSERT INTO users (business_id, full_name, email, password_hash, role, status) VALUES (?, ?, ?, ?, ?, ?)',
        [businessResult.insertId, name, email, passwordHash, 'business_admin', 'invited'],
      );
      await issueVerificationCode(connection, userResult.insertId, email, name);
      await connection.commit();
      return res.status(201).json({ email, verificationRequired: true, emailSent: true, expiresInSeconds: 600, resendAfterSeconds: 60 });
    } catch (error) {
      await connection.rollback().catch(() => {});
      return next(error);
    } finally {
      connection.release();
    }
  });

  router.post('/resend-verification-code', async (req, res, next) => {
    const connection = await getMySqlPool().getConnection();
    try {
      const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
      const [rows] = await connection.execute(
        "SELECT u.id, u.full_name FROM users u WHERE u.email = ? AND u.status = 'invited' LIMIT 1",
        [email],
      );
      if (!rows.length) return res.json({ message: 'If the account is eligible, a new code has been sent.' });
      const [codes] = await connection.execute('SELECT resend_after FROM email_verification_codes WHERE user_id = ? LIMIT 1', [rows[0].id]);
      if (codes[0]?.resend_after && new Date(codes[0].resend_after).getTime() > Date.now()) {
        return res.status(429).json({ error: 'Please wait before requesting another verification code.' });
      }
      await issueVerificationCode(connection, rows[0].id, email, rows[0].full_name);
      return res.json({ message: 'A new verification code has been sent.' });
    } catch (error) { return next(error); }
    finally { connection.release(); }
  });

  router.post('/verify-email', async (req, res, next) => {
    const connection = await getMySqlPool().getConnection();
    try {
      const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
      const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
      if (!/^\\d{6}$/.test(code)) return res.status(400).json({ error: 'Enter the six-digit verification code.' });
      await connection.beginTransaction();
      const [rows] = await connection.execute(
        "SELECT u.id, u.business_id, u.full_name, u.email, u.role, u.profile_image_url, u.created_at, v.code_hash, v.expires_at, v.attempts FROM users u JOIN email_verification_codes v ON v.user_id = u.id WHERE u.email = ? AND u.status = 'invited' FOR UPDATE",
        [email],
      );
      const row = rows[0];
      if (!row) { await connection.rollback(); return res.status(400).json({ error: 'The verification code is invalid or expired.' }); }
      if (row.attempts >= 5 || new Date(row.expires_at).getTime() <= Date.now() || createHash('sha256').update(code).digest('hex') !== row.code_hash) {
        await connection.execute('UPDATE email_verification_codes SET attempts = attempts + 1 WHERE user_id = ?', [row.id]);
        await connection.commit();
        return res.status(400).json({ error: 'The verification code is invalid or expired.' });
      }
      await connection.execute("UPDATE users SET status = 'active', email_verified_at = NOW() WHERE id = ?", [row.id]);
      await connection.execute('DELETE FROM email_verification_codes WHERE user_id = ?', [row.id]);
      await connection.execute("UPDATE businesses SET status = 'active' WHERE id = ?", [row.business_id]);
      await connection.commit();
      const token = issueMySqlAccessToken({ id: row.id, role: row.role, business_id: row.business_id }, secret);
      return res.json({ token, user: { id: String(row.id), name: row.full_name, email: row.email, role: row.role, businessId: String(row.business_id), profileImageUrl: row.profile_image_url, createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : new Date(row.created_at).toISOString(), isEmailVerified: true } });
    } catch (error) {
      await connection.rollback().catch(() => {});
      return next(error);
    } finally { connection.release(); }
  });


  async function issuePasswordResetCode(connection, userId, email, fullName) {
    if (!mailer) throw new Error('Email verification is not configured on the server.');
    const code = String(randomInt(100000, 1000000));
    const codeHash = createHash('sha256').update(code).digest('hex');
    await connection.execute(
      "INSERT INTO password_reset_codes (user_id, code_hash, expires_at, resend_after) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 10 MINUTE), DATE_ADD(NOW(), INTERVAL 60 SECOND)) ON DUPLICATE KEY UPDATE code_hash=VALUES(code_hash), reset_token_hash=NULL, expires_at=VALUES(expires_at), resend_after=VALUES(resend_after), attempts=0",
      [userId, codeHash],
    );
    await mailer.sendMail({
      from: process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER,
      to: email,
      subject: 'Reset your SAFI SALI COMPANIES password',
      text: 'Hello ' + fullName + ', your password reset code is ' + code + '. It expires in 10 minutes.',
    });
  }

  router.post('/forgot-password', async (req, res, next) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    if (!email || email.length > 190) return res.status(400).json({ error: 'Enter a valid email address.' });
    try {
      const [rows] = await getMySqlPool().execute("SELECT id, full_name FROM users WHERE email=? AND status='active' LIMIT 1", [email]);
      if (rows.length && mailer) {
        const connection = await getMySqlPool().getConnection();
        try {
          await connection.beginTransaction();
          await issuePasswordResetCode(connection, rows[0].id, email, rows[0].full_name);
          await connection.commit();
        } catch (error) {
          await connection.rollback().catch(() => {});
          throw error;
        } finally { connection.release(); }
      }
      return res.json({ message: 'If an active account exists for this address, a verification code has been sent.' });
    } catch (error) { return next(error); }
  });

  router.post('/resend-reset-code', async (req, res, next) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    if (!email || email.length > 190) return res.status(400).json({ error: 'Enter a valid email address.' });
    try {
      const [rows] = await getMySqlPool().execute("SELECT id, full_name FROM users WHERE email=? AND status='active' LIMIT 1", [email]);
      if (rows.length && mailer) {
        const connection = await getMySqlPool().getConnection();
        try {
          const [codes] = await connection.execute('SELECT resend_after FROM password_reset_codes WHERE user_id=? LIMIT 1', [rows[0].id]);
          if (codes[0]?.resend_after && new Date(codes[0].resend_after).getTime() > Date.now()) {
            return res.status(429).json({ error: 'Please wait before requesting another reset code.' });
          }
          await connection.beginTransaction();
          await issuePasswordResetCode(connection, rows[0].id, email, rows[0].full_name);
          await connection.commit();
        } catch (error) {
          await connection.rollback().catch(() => {});
          throw error;
        } finally { connection.release(); }
      }
      return res.json({ message: 'If the account is eligible, a new reset code has been sent.' });
    } catch (error) { return next(error); }
  });

  router.post('/verify-reset-code', async (req, res, next) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
    if (!/^\d{6}$/.test(code)) return res.status(400).json({ error: 'Enter the six-digit verification code.' });
    try {
      const connection = await getMySqlPool().getConnection();
      try {
        await connection.beginTransaction();
        const [rows] = await connection.execute(
          "SELECT u.id, c.code_hash, c.expires_at, c.attempts FROM users u JOIN password_reset_codes c ON c.user_id=u.id WHERE u.email=? AND u.status='active' FOR UPDATE",
          [email],
        );
        const row = rows[0];
        if (!row || row.attempts >= 5 || new Date(row.expires_at).getTime() <= Date.now() || createHash('sha256').update(code).digest('hex') !== row.code_hash) {
          if (row) await connection.execute('UPDATE password_reset_codes SET attempts=attempts+1 WHERE user_id=?', [row.id]);
          await connection.commit();
          return res.status(400).json({ error: 'The verification code is invalid or expired.' });
        }
        const resetToken = randomBytes(32).toString('hex');
        const tokenHash = createHash('sha256').update(resetToken).digest('hex');
        await connection.execute(
          'UPDATE password_reset_codes SET reset_token_hash=?, expires_at=DATE_ADD(NOW(), INTERVAL 10 MINUTE), attempts=0 WHERE user_id=?',
          [tokenHash, row.id],
        );
        await connection.commit();
        return res.json({ resetToken });
      } catch (error) {
        await connection.rollback().catch(() => {});
        throw error;
      } finally { connection.release(); }
    } catch (error) { return next(error); }
  });

  router.post('/reset-password', async (req, res, next) => {
    const token = typeof req.body?.token === 'string' ? req.body.token : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!/^[a-f0-9]{64}$/.test(token) || password.length < 12) {
      return res.status(400).json({ error: 'Provide a valid reset token and a password of at least 12 characters.' });
    }
    try {
      const tokenHash = createHash('sha256').update(token).digest('hex');
      const connection = await getMySqlPool().getConnection();
      try {
        await connection.beginTransaction();
        const [rows] = await connection.execute(
          'SELECT user_id FROM password_reset_codes WHERE reset_token_hash=? AND expires_at>NOW() FOR UPDATE',
          [tokenHash],
        );
        if (!rows.length) {
          await connection.rollback();
          return res.status(400).json({ error: 'The password reset token is invalid or expired.' });
        }
        const passwordHash = await hashMySqlPassword(password);
        await connection.execute('UPDATE users SET password_hash=? WHERE id=?', [passwordHash, rows[0].user_id]);
        await connection.execute('DELETE FROM password_reset_codes WHERE user_id=?', [rows[0].user_id]);
        await connection.commit();
        return res.json({ message: 'Password updated successfully.' });
      } catch (error) {
        await connection.rollback().catch(() => {});
        throw error;
      } finally { connection.release(); }
    } catch (error) { return next(error); }
  });

  router.post('/login', async (req, res, next) => {
    try {
      const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
      const password = typeof req.body?.password === 'string' ? req.body.password : '';
      if (!email || !password || email.length > 190) {
        return res.status(400).json({ error: 'Enter a valid email and password.' });
      }

      if (!consumeLoginAttempt(req, email)) {
        return res.status(429).json({ error: 'Too many sign-in attempts. Please try again in 15 minutes.' });
      }

      const [rows] = await getMySqlPool().execute(
        'SELECT id, business_id, full_name, email, password_hash, role, status, profile_image_url, created_at FROM users WHERE email = ? LIMIT 1',
        [email],
      );
      const user = rows[0];
      const validPassword = user ? await verifyMySqlPassword(password, user.password_hash) : false;
      if (!user || !validPassword || user.status !== 'active') {
        return res.status(401).json({ error: 'Email or password is incorrect, or the account is inactive.' });
      }

      const rateLimitKey = createHash('sha256').update((req.ip || req.socket.remoteAddress || 'unknown') + ':' + email).digest('hex');
      loginAttempts.delete(rateLimitKey);
      await getMySqlPool().execute('UPDATE users SET last_login_at = NOW() WHERE id = ?', [user.id]);
      const token = issueMySqlAccessToken(user, secret);
      return res.json({
        token,
        tokenType: 'Bearer',
        expiresIn: 28800,
        user: {
          id: String(user.id),
          name: user.full_name,
          email: user.email,
          role: user.role,
          businessId: user.business_id == null ? null : String(user.business_id),
          profileImageUrl: user.profile_image_url,
          createdAt: user.created_at instanceof Date ? user.created_at.toISOString() : new Date(user.created_at).toISOString(),
        },
      });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/me', authenticate, async (req, res, next) => {
    try {
      const [rows] = await getMySqlPool().execute(
        'SELECT id, business_id, full_name, email, role, status, profile_image_url, created_at FROM users WHERE id = ? LIMIT 1',
        [req.auth.sub],
      );
      const user = rows[0];
      if (!user || user.status !== 'active') {
        return res.status(401).json({ error: 'Account is inactive or no longer exists.' });
      }
      return res.json({
        user: {
          id: String(user.id),
          name: user.full_name,
          email: user.email,
          role: user.role,
          businessId: user.business_id == null ? null : String(user.business_id),
          profileImageUrl: user.profile_image_url,
          createdAt: user.created_at instanceof Date ? user.created_at.toISOString() : new Date(user.created_at).toISOString(),
        },
      });
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
