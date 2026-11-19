import { Router } from 'express';
import { getMySqlPool } from '../config/mysql.js';
import { createMySqlAuthenticate, requireMySqlRoles } from '../security/mysqlAuth.js';

export function createMySqlPayoutRouter(secret) {
  const router = Router();
  const auth = createMySqlAuthenticate(secret);

  router.post('/request', auth, requireMySqlRoles('affiliate'), async (req, res, next) => {
    const ids = Array.isArray(req.body?.commissionIds)
      ? [...new Set(req.body.commissionIds.map((id) => String(id)))]
      : [];
    if (!ids.length || ids.length > 100 || ids.some((id) => !/^\d{1,20}$/.test(id))) {
      return res.status(400).json({ error: 'Select between 1 and 100 payable commissions.' });
    }
    const connection = await getMySqlPool().getConnection();
    try {
      await connection.beginTransaction();
      const placeholders = ids.map(() => '?').join(',');
      const [rows] = await connection.execute(
        `SELECT c.id,c.commission_amount,c.currency,s.business_id
         FROM commissions c JOIN sales s ON s.id=c.sale_id
         WHERE c.id IN (${placeholders}) AND c.affiliate_user_id=? AND c.status='payable'
         ORDER BY c.id FOR UPDATE`,
        [...ids, req.auth.sub],
      );
      if (rows.length !== ids.length) {
        await connection.rollback();
        return res.status(409).json({ error: 'One or more selected commissions are not payable or do not belong to your account.' });
      }
      const currencies = new Set(rows.map((row) => row.currency));
      const businesses = new Set(rows.map((row) => String(row.business_id)));
      if (currencies.size !== 1 || businesses.size !== 1) {
        await connection.rollback();
        return res.status(400).json({ error: 'A payout must contain commissions from one business and one currency.' });
      }
      const amount = rows.reduce((sum, row) => sum + Math.round(Number(row.commission_amount) * 100), 0);
      if (!Number.isSafeInteger(amount) || amount <= 0) {
        await connection.rollback();
        return res.status(400).json({ error: 'The payout amount is invalid.' });
      }
      const method = typeof req.body?.method === 'string' ? req.body.method.trim().slice(0,40) : '';
      const destination = typeof req.body?.destination === 'string' ? req.body.destination.trim().slice(0,190) : '';
      if (!method || !destination) {
        await connection.rollback();
        return res.status(400).json({ error: 'Payment method and destination are required.' });
      }
      const businessId = rows[0].business_id;
      const [payout] = await connection.execute(
        "INSERT INTO payouts (affiliate_user_id,business_id,amount,currency,method,destination_ref,status) VALUES (?,?,?,?,?,?,'requested')",
        [req.auth.sub,businessId,(amount / 100).toFixed(2),rows[0].currency,method,destination],
      );
      for (const row of rows) {
        await connection.execute(
          "INSERT INTO payout_commissions (payout_id,commission_id,amount) VALUES (?,?,?)",
          [payout.insertId,row.id,row.commission_amount],
        );
        await connection.execute("UPDATE commissions SET status='reserved' WHERE id=? AND status='payable'", [row.id]);
      }
      await connection.execute(
        "INSERT INTO notifications (recipient_user_id,business_id,event_type,title,message) VALUES (?,?, 'payout_requested','Withdrawal requested','An affiliate submitted a withdrawal request for review.')",
        [req.auth.sub,businessId],
      );
      await connection.commit();
      return res.status(201).json({ payoutId: String(payout.insertId), amount: (amount / 100).toFixed(2), currency: rows[0].currency, status: 'requested' });
    } catch (error) {
      await connection.rollback().catch(() => {});
      return next(error);
    } finally { connection.release(); }
  });

  router.get('/mine', auth, requireMySqlRoles('affiliate'), async (req, res, next) => {
    try {
      const [rows] = await getMySqlPool().execute(
        'SELECT id,amount,currency,method,status,requested_at,processed_at,external_reference FROM payouts WHERE affiliate_user_id=? ORDER BY requested_at DESC LIMIT 100',
        [req.auth.sub],
      );
      return res.json({ payouts: rows });
    } catch (error) { return next(error); }
  });

  router.get('/', auth, requireMySqlRoles('finance_admin','super_admin'), async (req, res, next) => {
    try {
      const status = typeof req.query.status === 'string' ? req.query.status : '';
      const allowed = ['requested','approved','processing','paid','rejected','failed'];
      if (status && !allowed.includes(status)) return res.status(400).json({ error: 'Invalid payout status.' });
      const params = [];
      let where = '';
      if (status) { where = 'WHERE p.status=?'; params.push(status); }
      const [rows] = await getMySqlPool().execute(
        `SELECT p.id,p.affiliate_user_id,p.business_id,p.amount,p.currency,p.method,p.status,p.requested_at,p.processed_at,p.external_reference,
                (SELECT COUNT(*) FROM payout_commissions pc WHERE pc.payout_id=p.id) AS commission_count
         FROM payouts p ${where} ORDER BY p.requested_at ASC LIMIT 200`,
        params,
      );
      return res.json({ payouts: rows });
    } catch (error) { return next(error); }
  });

  router.patch('/:payoutId/decision', auth, requireMySqlRoles('finance_admin','super_admin'), async (req, res, next) => {
    const decision = req.body?.decision;
    if (!['approve','reject'].includes(decision)) return res.status(400).json({ error: 'Decision must be approve or reject.' });
    const connection = await getMySqlPool().getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.execute('SELECT * FROM payouts WHERE id=? FOR UPDATE', [req.params.payoutId]);
      if (!rows.length) { await connection.rollback(); return res.status(404).json({ error: 'Payout not found.' }); }
      const payout = rows[0];
      if (payout.status !== 'requested') { await connection.rollback(); return res.status(409).json({ error: 'Only requested payouts can be reviewed.' }); }
      const nextStatus = decision === 'approve' ? 'approved' : 'rejected';
      await connection.execute('UPDATE payouts SET status=?,processed_by=?,processed_at=NOW() WHERE id=?', [nextStatus,req.auth.sub,payout.id]);
      if (decision === 'reject') {
        await connection.execute(
          "UPDATE commissions c JOIN payout_commissions pc ON pc.commission_id=c.id SET c.status='payable' WHERE pc.payout_id=? AND c.status='reserved'",
          [payout.id],
        );
      }
      await connection.execute(
        'INSERT INTO notifications (recipient_user_id,business_id,event_type,title,message) VALUES (?,?,?,?,?)',
        [payout.affiliate_user_id,payout.business_id,'payout_'+nextStatus,'Withdrawal '+nextStatus,decision === 'approve' ? 'Your withdrawal request was approved.' : 'Your withdrawal request was rejected; the commissions are available again.'],
      );
      await connection.commit();
      return res.json({ payoutId: String(payout.id), status: nextStatus });
    } catch (error) { await connection.rollback().catch(() => {}); return next(error); }
    finally { connection.release(); }
  });

  router.post('/:payoutId/paid', auth, requireMySqlRoles('finance_admin','super_admin'), async (req, res, next) => {
    const externalReference = typeof req.body?.externalReference === 'string' ? req.body.externalReference.trim().slice(0,120) : '';
    if (!externalReference) return res.status(400).json({ error: 'A payment reference is required to confirm payout.' });
    const connection = await getMySqlPool().getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.execute('SELECT * FROM payouts WHERE id=? FOR UPDATE', [req.params.payoutId]);
      if (!rows.length) { await connection.rollback(); return res.status(404).json({ error: 'Payout not found.' }); }
      const payout = rows[0];
      if (!['approved','processing'].includes(payout.status)) { await connection.rollback(); return res.status(409).json({ error: 'Only approved payouts can be marked paid.' }); }
      const [commissions] = await connection.execute(
        "SELECT c.id,c.status FROM commissions c JOIN payout_commissions pc ON pc.commission_id=c.id WHERE pc.payout_id=? FOR UPDATE",
        [payout.id],
      );
      if (!commissions.length || commissions.some((row) => row.status !== 'reserved')) {
        await connection.rollback();
        return res.status(409).json({ error: 'Reserved commissions do not match this payout.' });
      }
      await connection.execute("UPDATE commissions c JOIN payout_commissions pc ON pc.commission_id=c.id SET c.status='paid' WHERE pc.payout_id=?", [payout.id]);
      await connection.execute(
        "INSERT INTO financial_transactions (business_id,user_id,payout_id,idempotency_key,type,direction,amount,currency,status,description) VALUES (?,?,?,?, 'payout_debit','debit',?,?, 'posted',?)",
        [payout.business_id,payout.affiliate_user_id,payout.id,'payout:'+payout.id,payout.amount,payout.currency,'Affiliate payout '+payout.id],
      );
      await connection.execute(
        "UPDATE payouts SET status='paid',processed_by=?,processed_at=NOW(),external_reference=? WHERE id=?",
        [req.auth.sub,externalReference,payout.id],
      );
      await connection.execute(
        "INSERT INTO notifications (recipient_user_id,business_id,event_type,title,message) VALUES (?,?, 'payout_paid','Withdrawal paid','Your withdrawal has been marked as paid.')",
        [payout.affiliate_user_id,payout.business_id],
      );
      await connection.commit();
      return res.json({ payoutId: String(payout.id), status: 'paid', externalReference });
    } catch (error) {
      await connection.rollback().catch(() => {});
      if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'This payout has already been recorded in the ledger.' });
      return next(error);
    } finally { connection.release(); }
  });

  return router;
}
