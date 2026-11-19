import test from 'node:test';
import assert from 'node:assert/strict';
import mysql from 'mysql2/promise';

const enabled = process.env.MYSQL_INTEGRATION === '1';
const connectionOptions = {
  host: process.env.MYSQL_HOST || '127.0.0.1',
  port: Number(process.env.MYSQL_PORT || 3306),
  database: process.env.MYSQL_DATABASE,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD || '',
  charset: 'utf8mb4',
};

test('live MySQL migrations create the complete affiliate platform schema', { skip: !enabled }, async () => {
  assert.ok(connectionOptions.database, 'MYSQL_DATABASE must be set');
  const db = await mysql.createConnection(connectionOptions);
  try {
    const [versionRows] = await db.query('SELECT VERSION() AS version, DATABASE() AS databaseName');
    assert.match(versionRows[0].version, /^8\\./, 'CI integration target must be MySQL 8.x');

    const expectedTables = [
      'schema_migrations', 'businesses', 'users', 'affiliate_profiles',
      'commission_rules', 'referral_links', 'referrals', 'sales',
      'commissions', 'financial_transactions', 'payouts', 'payout_commissions',
      'notifications', 'audit_logs', 'email_verification_codes', 'password_reset_codes',
    ];
    const [tableRows] = await db.execute(
      'SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?',
      [connectionOptions.database],
    );
    const actualTables = new Set(tableRows.map((row) => row.TABLE_NAME));
    for (const table of expectedTables) assert.ok(actualTables.has(table), `Missing migrated table: ${table}`);

    const [migrationRows] = await db.query('SELECT version FROM schema_migrations ORDER BY version');
    assert.deepEqual(
      migrationRows.map((row) => row.version),
      [
        '001_affiliate_platform.sql',
        '002_email_verification.sql',
        '003_password_reset.sql',
        '004_payout_workflow.sql',
      ],
    );

    // Exercise real foreign keys, DECIMAL money columns, unique referral attribution,
    // commission creation, payout reservation, and notification writes in one transaction.
    await db.beginTransaction();
    try {
      const [business] = await db.execute(
        "INSERT INTO businesses (name, slug, status) VALUES (?, ?, 'active')",
        ['CI Integration Business', `ci-${Date.now()}`],
      );
      const businessId = business.insertId;

      const [admin] = await db.execute(
        "INSERT INTO users (business_id, full_name, email, password_hash, role, status) VALUES (?, ?, ?, ?, 'business_admin', 'active')",
        [businessId, 'CI Business Admin', `admin-${Date.now()}@example.test`, 'test-hash'],
      );
      const [affiliate] = await db.execute(
        "INSERT INTO users (business_id, full_name, email, password_hash, role, status) VALUES (?, ?, ?, ?, 'affiliate', 'active')",
        [businessId, 'CI Affiliate', `affiliate-${Date.now()}@example.test`, 'test-hash'],
      );
      const adminId = admin.insertId;
      const affiliateId = affiliate.insertId;

      await db.execute(
        'INSERT INTO affiliate_profiles (user_id, affiliate_code) VALUES (?, ?)',
        [affiliateId, `CI-${affiliateId}`],
      );
      const [rule] = await db.execute(
        "INSERT INTO commission_rules (business_id, rate_percent, created_by) VALUES (?, 10.00, ?)",
        [businessId, adminId],
      );
      const [link] = await db.execute(
        'INSERT INTO referral_links (affiliate_user_id, business_id, code) VALUES (?, ?, ?)',
        [affiliateId, businessId, `REF-${affiliateId}`],
      );
      const attribution = 'a'.repeat(64);
      const [referral] = await db.execute(
        "INSERT INTO referrals (referral_link_id, affiliate_user_id, business_id, attribution_token, status) VALUES (?, ?, ?, ?, 'converted')",
        [link.insertId, affiliateId, businessId, attribution],
      );
      const [sale] = await db.execute(
        "INSERT INTO sales (business_id, referral_id, external_order_ref, gross_amount, eligible_amount, status, confirmed_at) VALUES (?, ?, ?, 100.00, 100.00, 'confirmed', NOW())",
        [businessId, referral.insertId, `ORDER-${affiliateId}`],
      );
      const [commission] = await db.execute(
        "INSERT INTO commissions (sale_id, affiliate_user_id, rule_id, rate_percent, basis_amount, commission_amount, currency, status) VALUES (?, ?, ?, 10.00, 100.00, 10.00, 'USD', 'payable')",
        [sale.insertId, affiliateId, rule.insertId],
      );
      const [payout] = await db.execute(
        "INSERT INTO payouts (affiliate_user_id, business_id, amount, currency, method, destination_ref) VALUES (?, ?, 10.00, 'USD', 'test', 'ci-destination')",
        [affiliateId, businessId],
      );
      await db.execute(
        'INSERT INTO payout_commissions (payout_id, commission_id, amount) VALUES (?, ?, 10.00)',
        [payout.insertId, commission.insertId],
      );
      await db.execute(
        "INSERT INTO financial_transactions (business_id, user_id, commission_id, payout_id, idempotency_key, type, direction, amount, currency, status) VALUES (?, ?, ?, ?, ?, 'commission_credit', 'credit', 10.00, 'USD', 'posted')",
        [businessId, affiliateId, commission.insertId, payout.insertId, `ci-ledger-${affiliateId}`],
      );
      await db.execute(
        "INSERT INTO notifications (recipient_user_id, business_id, event_type, title, message) VALUES (?, ?, 'ci.test', 'Integration test', 'MySQL integration is working')",
        [affiliateId, businessId],
      );
      const [amountRows] = await db.execute(
        'SELECT commission_amount FROM commissions WHERE id = ?',
        [commission.insertId],
      );
      assert.equal(amountRows[0].commission_amount, '10.00');

      // A duplicate attribution token must be rejected by the database.
      await assert.rejects(() => db.execute(
        "INSERT INTO referrals (referral_link_id, affiliate_user_id, business_id, attribution_token) VALUES (?, ?, ?, ?)",
        [link.insertId, affiliateId, businessId, attribution],
      ));
    } finally {
      await db.rollback();
    }
  } finally {
    await db.end();
  }
});
