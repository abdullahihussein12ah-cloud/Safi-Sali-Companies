import { Router } from 'express';
import { getMySqlPool } from '../config/mysql.js';
import {
  createMySqlAuthenticate,
  issueMySqlAccessToken,
  verifyMySqlPassword,
} from '../security/mysqlAuth.js';

export function createMySqlAuthRouter(secret) {
  const router = Router();
  const authenticate = createMySqlAuthenticate(secret);

  router.post('/login', async (req, res, next) => {
    try {
      const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
      const password = typeof req.body?.password === 'string' ? req.body.password : '';
      if (!email || !password || email.length > 190) {
        return res.status(400).json({ error: 'Enter a valid email and password.' });
      }

      const [rows] = await getMySqlPool().execute(
        'SELECT id, business_id, full_name, email, password_hash, role, status, profile_image_url FROM users WHERE email = ? LIMIT 1',
        [email],
      );
      const user = rows[0];
      const validPassword = user ? await verifyMySqlPassword(password, user.password_hash) : false;
      if (!user || !validPassword || user.status !== 'active') {
        return res.status(401).json({ error: 'Email or password is incorrect, or the account is inactive.' });
      }

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
        },
      });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/me', authenticate, async (req, res, next) => {
    try {
      const [rows] = await getMySqlPool().execute(
        'SELECT id, business_id, full_name, email, role, status, profile_image_url FROM users WHERE id = ? LIMIT 1',
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
        },
      });
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
