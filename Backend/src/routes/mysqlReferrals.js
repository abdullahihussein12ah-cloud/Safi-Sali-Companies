import { Router } from 'express';
import { randomBytes, createHash } from 'node:crypto';
import { getMySqlPool } from '../config/mysql.js';
import { createMySqlAuthenticate, requireMySqlRoles } from '../security/mysqlAuth.js';

const code = () => randomBytes(9).toString('base64url');
const token = (value) => createHash('sha256').update(value).digest('hex');

export function createMySqlReferralRouter(secret) {
  const router = Router();
  const auth = createMySqlAuthenticate(secret);

  router.post('/links', auth, requireMySqlRoles('affiliate'), async (req, res, next) => {
    try {
      const businessId = Number(req.body?.businessId);
      const campaignName = typeof req.body?.campaignName === 'string' ? req.body.campaignName.trim().slice(0,160) : null;
      if (!Number.isSafeInteger(businessId) || businessId < 1) return res.status(400).json({ error: 'A valid businessId is required.' });
      const db = getMySqlPool();
      const [businesses] = await db.execute("SELECT id FROM businesses WHERE id=? AND status='active' LIMIT 1", [businessId]);
      if (!businesses.length) return res.status(404).json({ error: 'Active business not found.' });
      const referralCode = code();
      await db.execute('INSERT INTO referral_links (affiliate_user_id,business_id,code,campaign_name) VALUES (?,?,?,?)', [req.auth.sub,businessId,referralCode,campaignName]);
      return res.status(201).json({ code: referralCode, businessId, campaignName, path: '/r/' + referralCode });
    } catch (error) { return next(error); }
  });

  // Public click tracking: never accepts an arbitrary redirect URL from the caller.
  router.get('/track/:code', async (req, res, next) => {
    const connection = await getMySqlPool().getConnection();
    try {
      await connection.beginTransaction();
      const [links] = await connection.execute(
        "SELECT id, affiliate_user_id, business_id FROM referral_links WHERE code=? AND is_active=1 LIMIT 1 FOR UPDATE",
        [String(req.params.code).slice(0,80)],
      );
      if (!links.length) { await connection.rollback(); return res.status(404).json({ error: 'Referral link not found.' }); }
      const link = links[0];
      const rawToken = randomBytes(32).toString('hex');
      const attributionToken = token(rawToken);
      await connection.execute('UPDATE referral_links SET clicks=clicks+1 WHERE id=?', [link.id]);
      await connection.execute(
        "INSERT INTO referrals (referral_link_id,affiliate_user_id,business_id,attribution_token,status) VALUES (?,?,?,?,'clicked')",
        [link.id,link.affiliate_user_id,link.business_id,attributionToken],
      );
      await connection.commit();
      return res.status(201).json({ referralToken: rawToken, businessId: String(link.business_id), message: 'Referral click recorded.' });
    } catch (error) { await connection.rollback(); return next(error); }
    finally { connection.release(); }
  });


  // Create a business sale with a verified affiliate attribution token.
  router.post('/sales', auth, requireMySqlRoles('business_admin','super_admin'), async (req, res, next) => {
    const businessId = req.auth.role === 'super_admin' ? Number(req.body?.businessId) : Number(req.auth.businessId);
    const referralToken = typeof req.body?.referralToken === 'string' ? req.body.referralToken : '';
    const externalOrderRef = typeof req.body?.externalOrderRef === 'string' ? req.body.externalOrderRef.trim().slice(0,120) : '';
    const currency = typeof req.body?.currency === 'string' ? req.body.currency.trim().toUpperCase() : '';
    const grossAmount = typeof req.body?.grossAmount === 'string' || typeof req.body?.grossAmount === 'number' ? String(req.body.grossAmount) : '';
    const eligibleAmount = typeof req.body?.eligibleAmount === 'string' || typeof req.body?.eligibleAmount === 'number' ? String(req.body.eligibleAmount) : '';
    const cents = (value) => {
      if (!/^\\d{1,12}(?:\\.\\d{1,2})?$/.test(value)) return null;
      const [whole, fraction = ''] = value.split('.');
      return BigInt(whole) * 100n + BigInt((fraction + '00').slice(0,2));
    };
    const grossCents = cents(grossAmount);
    const eligibleCents = cents(eligibleAmount);
    if (!Number.isSafeInteger(businessId) || businessId < 1 || !/^[A-Z]{3}$/.test(currency) ||
        !externalOrderRef || !/^[a-f0-9]{64}$/.test(referralToken) ||
        grossCents === null || eligibleCents === null || grossCents <= 0n || eligibleCents > grossCents) {
      return res.status(400).json({ error: 'Provide valid sale, currency, amount, and referral attribution details.' });
    }
    const connection = await getMySqlPool().getConnection();
    try {
      await connection.beginTransaction();
      const [links] = await connection.execute(
        "SELECT id, affiliate_user_id FROM referrals WHERE attribution_token=? AND business_id=? AND status IN ('clicked','registered') LIMIT 1 FOR UPDATE",
        [token(referralToken), businessId],
      );
      if (!links.length) {
        await connection.rollback();
        return res.status(404).json({ error: 'The referral attribution is invalid, expired, or belongs to another business.' });
      }
      const [result] = await connection.execute(
        "INSERT INTO sales (business_id, referral_id, external_order_ref, currency, gross_amount, eligible_amount, status) VALUES (?,?,?,?,?,?, 'pending')",
        [businessId, links[0].id, externalOrderRef, currency, grossAmount, eligibleAmount],
      );
      await connection.commit();
      return res.status(201).json({ saleId: String(result.insertId), status: 'pending', referralAttributed: true });
    } catch (error) {
      await connection.rollback().catch(() => {});
      if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'This order reference already exists for the business.' });
      return next(error);
    } finally { connection.release(); }
  });

  // Confirm a previously-created sale and create its commission exactly once.
  router.post('/sales/:saleId/confirm', auth, requireMySqlRoles('business_admin','super_admin'), async (req, res, next) => {
    const connection = await getMySqlPool().getConnection();
    try {
      await connection.beginTransaction();
      const [sales] = await connection.execute('SELECT * FROM sales WHERE id=? FOR UPDATE', [req.params.saleId]);
      if (!sales.length) { await connection.rollback(); return res.status(404).json({ error: 'Sale not found.' }); }
      const sale = sales[0];
      if (req.auth.role !== 'super_admin' && String(sale.business_id) !== req.auth.businessId) {
        await connection.rollback(); return res.status(403).json({ error: 'Sale belongs to another business.' });
      }
      if (sale.status === 'refunded' || sale.status === 'cancelled') {
        await connection.rollback(); return res.status(409).json({ error: 'Cancelled or refunded sales cannot be confirmed.' });
      }
      if (sale.status === 'confirmed') {
        const [existing] = await connection.execute('SELECT id,rate_percent,basis_amount,commission_amount,currency,status FROM commissions WHERE sale_id=?', [sale.id]);
        await connection.commit();
        return res.json({ saleId: String(sale.id), alreadyConfirmed: true, commission: existing[0] || null });
      }
      await connection.execute("UPDATE sales SET status='confirmed', confirmed_at=NOW() WHERE id=?", [sale.id]);
      let commission = null;
      if (sale.referral_id) {
        const [refs] = await connection.execute("SELECT affiliate_user_id,business_id FROM referrals WHERE id=? AND status IN ('clicked','registered') FOR UPDATE", [sale.referral_id]);
        if (refs.length && String(refs[0].business_id) === String(sale.business_id)) {
          const ref = refs[0];
          const [rules] = await connection.execute(
            "SELECT id,rate_percent FROM commission_rules WHERE is_active=1 AND (business_id=? OR business_id IS NULL) AND (affiliate_user_id=? OR affiliate_user_id IS NULL) AND effective_from<=NOW() AND (effective_until IS NULL OR effective_until>NOW()) ORDER BY (affiliate_user_id IS NOT NULL) DESC,(business_id IS NOT NULL) DESC,effective_from DESC LIMIT 1",
            [sale.business_id,ref.affiliate_user_id],
          );
          const rule = rules[0] || { id: null, rate_percent: '10.00' };
          const [created] = await connection.execute(
            "INSERT INTO commissions (sale_id,affiliate_user_id,rule_id,rate_percent,basis_amount,commission_amount,currency,status) VALUES (?,?,?,?,?,?,?,'pending')",
            [sale.id,ref.affiliate_user_id,rule.id,rule.rate_percent,sale.eligible_amount,(Number(sale.eligible_amount)*Number(rule.rate_percent)/100).toFixed(2),sale.currency],
          );
          commission = { id: String(created.insertId), ratePercent: String(rule.rate_percent), amount: (Number(sale.eligible_amount)*Number(rule.rate_percent)/100).toFixed(2), currency: sale.currency, status: 'pending' };
          await connection.execute("UPDATE referrals SET status='converted',converted_at=NOW() WHERE id=?", [sale.referral_id]);
          await connection.execute(
            "INSERT INTO notifications (recipient_user_id,business_id,event_type,title,message) VALUES (?,?, 'commission_pending','Commission earned','A referred sale was confirmed. Your commission is pending approval.')",
            [ref.affiliate_user_id,sale.business_id],
          );
        }
      }
      await connection.commit();
      return res.json({ saleId: String(sale.id), status: 'confirmed', commission });
    } catch (error) { await connection.rollback(); return next(error); }
    finally { connection.release(); }
  });

  return router;
}
