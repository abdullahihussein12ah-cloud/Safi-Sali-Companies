import { Router } from 'express';
import { getMySqlPool } from '../config/mysql.js';
import { createMySqlAuthenticate } from '../security/mysqlAuth.js';

export function createMySqlNotificationRouter(secret) {
  const router = Router();
  const auth = createMySqlAuthenticate(secret);

  router.get('/', auth, async (req, res, next) => {
    try {
      const limit = Math.min(Math.max(Number.parseInt(req.query.limit,10) || 25,1),100);
      const [rows] = await getMySqlPool().execute(
        'SELECT id,business_id,event_type,title,message,action_url,read_at,created_at FROM notifications WHERE recipient_user_id=? ORDER BY created_at DESC,id DESC LIMIT ?',
        [req.auth.sub,limit],
      );
      const [[counts]] = await getMySqlPool().execute(
        'SELECT COUNT(*) AS unread FROM notifications WHERE recipient_user_id=? AND read_at IS NULL',
        [req.auth.sub],
      );
      return res.json({ notifications: rows, unreadCount: counts.unread });
    } catch (error) { return next(error); }
  });

  router.patch('/:notificationId/read', auth, async (req, res, next) => {
    try {
      const [result] = await getMySqlPool().execute(
        'UPDATE notifications SET read_at=COALESCE(read_at,NOW()) WHERE id=? AND recipient_user_id=?',
        [req.params.notificationId,req.auth.sub],
      );
      if (!result.affectedRows) return res.status(404).json({ error: 'Notification not found.' });
      return res.json({ id: String(req.params.notificationId), read: true });
    } catch (error) { return next(error); }
  });

  router.patch('/read-all', auth, async (req, res, next) => {
    try {
      const [result] = await getMySqlPool().execute(
        'UPDATE notifications SET read_at=NOW() WHERE recipient_user_id=? AND read_at IS NULL',
        [req.auth.sub],
      );
      return res.json({ markedRead: result.affectedRows });
    } catch (error) { return next(error); }
  });

  return router;
}
