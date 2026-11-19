import { Router } from 'express';
import { getMySqlPool } from '../config/mysql.js';
import { createMySqlAuthenticate, requireMySqlRoles } from '../security/mysqlAuth.js';

const money = (value) => String(value ?? '0.00');

export function createMySqlDashboardRouter(secret) {
  const router = Router();
  const auth = createMySqlAuthenticate(secret);

  // Super Admin: platform-wide KPIs; this endpoint is intentionally role-restricted.
  router.get('/super-admin/overview', auth, requireMySqlRoles('super_admin'), async (_req, res, next) => {
    try {
      const db = getMySqlPool();
      const [[businesses]] = await db.execute("SELECT COUNT(*) AS total, SUM(status='active') AS active FROM businesses");
      const [[users]] = await db.execute("SELECT COUNT(*) AS total, SUM(role='affiliate') AS affiliates, SUM(role='business_admin') AS businessAdmins FROM users");
      const [[sales]] = await db.execute("SELECT COUNT(*) AS total, COALESCE(SUM(CASE WHEN status='confirmed' THEN eligible_amount ELSE 0 END),0) AS eligibleRevenue FROM sales");
      const [[commissions]] = await db.execute("SELECT COALESCE(SUM(commission_amount),0) AS total, COALESCE(SUM(CASE WHEN status IN ('pending','approved','payable') THEN commission_amount ELSE 0 END),0) AS outstanding FROM commissions");
      return res.json({ businesses, users, sales: { ...sales, eligibleRevenue: money(sales.eligibleRevenue) }, commissions: { total: money(commissions.total), outstanding: money(commissions.outstanding) } });
    } catch (error) { return next(error); }
  });

  // Business Admin: always scopes data to the business_id in the signed token.
  router.get('/business-admin/overview', auth, requireMySqlRoles('business_admin'), async (req, res, next) => {
    try {
      if (!req.auth.businessId) return res.status(403).json({ error: 'No business is assigned to this account.' });
      const db = getMySqlPool();
      const id = req.auth.businessId;
      const [[sales]] = await db.execute("SELECT COUNT(*) AS total, COALESCE(SUM(CASE WHEN status='confirmed' THEN eligible_amount ELSE 0 END),0) AS eligibleRevenue FROM sales WHERE business_id=?", [id]);
      const [[affiliates]] = await db.execute("SELECT COUNT(DISTINCT affiliate_user_id) AS total FROM referral_links WHERE business_id=? AND is_active=1", [id]);
      const [[commissions]] = await db.execute("SELECT COALESCE(SUM(c.commission_amount),0) AS total FROM commissions c JOIN sales s ON s.id=c.sale_id WHERE s.business_id=?", [id]);
      return res.json({ businessId: id, sales: { ...sales, eligibleRevenue: money(sales.eligibleRevenue) }, activeAffiliates: affiliates.total, commissions: money(commissions.total) });
    } catch (error) { return next(error); }
  });

  // Affiliate: ownership is derived from the authenticated token, never a client ID.
  router.get('/affiliate/overview', auth, requireMySqlRoles('affiliate'), async (req, res, next) => {
    try {
      const db = getMySqlPool();
      const id = req.auth.sub;
      const [[links]] = await db.execute("SELECT COUNT(*) AS totalLinks, COALESCE(SUM(clicks),0) AS clicks FROM referral_links WHERE affiliate_user_id=? AND is_active=1", [id]);
      const [[referrals]] = await db.execute("SELECT COUNT(*) AS total, SUM(status='converted') AS converted FROM referrals WHERE affiliate_user_id=?", [id]);
      const [[earnings]] = await db.execute("SELECT COALESCE(SUM(commission_amount),0) AS total, COALESCE(SUM(CASE WHEN status IN ('pending','approved','payable') THEN commission_amount ELSE 0 END),0) AS pending, COALESCE(SUM(CASE WHEN status='paid' THEN commission_amount ELSE 0 END),0) AS paid FROM commissions WHERE affiliate_user_id=?", [id]);
      return res.json({ links, referrals, earnings: { total: money(earnings.total), pending: money(earnings.pending), paid: money(earnings.paid) } });
    } catch (error) { return next(error); }
  });

  // Finance: read-only financial overview; payout execution gets a separate audited workflow.
  router.get('/finance/overview', auth, requireMySqlRoles('finance_admin','super_admin'), async (_req, res, next) => {
    try {
      const db = getMySqlPool();
      const [[transactions]] = await db.execute("SELECT COUNT(*) AS total, COALESCE(SUM(CASE WHEN status='posted' AND direction='credit' THEN amount ELSE 0 END),0) AS credits, COALESCE(SUM(CASE WHEN status='posted' AND direction='debit' THEN amount ELSE 0 END),0) AS debits FROM financial_transactions");
      const [[payouts]] = await db.execute("SELECT COUNT(*) AS total, COALESCE(SUM(CASE WHEN status='requested' THEN amount ELSE 0 END),0) AS requestedAmount FROM payouts");
      return res.json({ transactions: { ...transactions, credits: money(transactions.credits), debits: money(transactions.debits) }, payouts: { ...payouts, requestedAmount: money(payouts.requestedAmount) } });
    } catch (error) { return next(error); }
  });


  // Monthly report data is scoped to the authenticated role and never returns customer identities.
  router.get('/reports/monthly', auth, async (req, res, next) => {
    try {
      const db = getMySqlPool();
      const params = [];
      let saleScope = '';
      let commissionScope = '';
      if (req.auth.role === 'business_admin') {
        if (!req.auth.businessId) return res.status(403).json({ error: 'No business is assigned to this account.' });
        saleScope = ' AND s.business_id=?';
        commissionScope = ' AND s.business_id=?';
        params.push(req.auth.businessId);
      } else if (req.auth.role === 'affiliate') {
        saleScope = ' AND r.affiliate_user_id=?';
        commissionScope = ' AND c.affiliate_user_id=?';
        params.push(req.auth.sub);
      } else if (!['super_admin','finance_admin'].includes(req.auth.role)) {
        return res.status(403).json({ error: 'You are not allowed to view reports.' });
      }
      const [sales] = await db.execute(
        `SELECT DATE_FORMAT(s.created_at,'%Y-%m') AS month, s.currency, COUNT(*) AS salesCount,
          COALESCE(SUM(CASE WHEN s.status='confirmed' THEN s.eligible_amount ELSE 0 END),0) AS eligibleRevenue
         FROM sales s LEFT JOIN referrals r ON r.id=s.referral_id
         WHERE s.created_at >= DATE_SUB(CURRENT_DATE, INTERVAL 11 MONTH)${saleScope}
         GROUP BY DATE_FORMAT(s.created_at,'%Y-%m'),s.currency ORDER BY month ASC`,
        params,
      );
      const [commissions] = await db.execute(
        `SELECT DATE_FORMAT(c.created_at,'%Y-%m') AS month,c.currency,COUNT(*) AS commissionCount,
          COALESCE(SUM(c.commission_amount),0) AS commissionTotal,
          COALESCE(SUM(CASE WHEN c.status='paid' THEN c.commission_amount ELSE 0 END),0) AS paidTotal
         FROM commissions c JOIN sales s ON s.id=c.sale_id
         WHERE c.created_at >= DATE_SUB(CURRENT_DATE, INTERVAL 11 MONTH)${commissionScope}
         GROUP BY DATE_FORMAT(c.created_at,'%Y-%m'),c.currency ORDER BY month ASC`,
        params,
      );
      return res.json({
        periodMonths: 12,
        sales: sales.map(row => ({ ...row, eligibleRevenue: money(row.eligibleRevenue) })),
        commissions: commissions.map(row => ({ ...row, commissionTotal: money(row.commissionTotal), paidTotal: money(row.paidTotal) })),
      });
    } catch (error) { return next(error); }
  });

  return router;
}
