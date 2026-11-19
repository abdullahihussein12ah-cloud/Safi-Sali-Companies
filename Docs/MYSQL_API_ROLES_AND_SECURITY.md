# SAFI SALI COMPANIES — MySQL API foundation

This document describes the isolated MySQL authentication API foundation on
`feature/affiliate-marketing-mysql`. It is not yet mounted in the existing
Express server; the legacy server still starts through the MongoDB connector.
Do not describe the platform as fully migrated until the remaining cutover and
integration tests pass.

## Authentication

Base path when mounted: `/api/mysql-auth`

### POST /login
Request:
```json
{ "email": "affiliate@example.com", "password": "a-long-password" }
```
Success returns a short-lived Bearer access token and a minimal user profile.
Inactive accounts and invalid credentials return the same 401 response.

### GET /me
Header: `Authorization: Bearer <token>`
Returns the current active account profile.

## Roles and access boundaries

- `super_admin`: platform-wide administration. Sensitive actions must be
  separately audited and must never be exposed to ordinary business users.
- `business_admin`: manage only the business assigned in `users.business_id`.
- `affiliate`: access only their own referral links, attributed conversions,
  commissions, payout requests, and notifications.
- `finance_admin`: finance workflows only; must not administer users or alter
  commission rules unless explicitly granted by a later permission policy.

Every protected route must authenticate first, then authorize by role and
resource ownership. Never trust a business ID or affiliate ID supplied by the
client; derive ownership from the authenticated identity and verify it in SQL.
Use parameterized queries for all values.

## Commission and financial rules

- Default commission rate is 10%; only an authorized Super Admin can change
  platform-wide defaults. Any business-specific override must be explicit,
  dated, and audited.
- Calculate commissions from the eligible sale amount, not blindly from gross
  amount. Store the applied rate and amount on the commission record.
- Use MySQL DECIMAL for money, never floating-point arithmetic.
- Make sale conversion and commission creation transactional and idempotent.
- Refunds/reversals must create traceable reversing entries; do not delete
  posted financial history.
- Payouts require an approval and processing state transition with an audit log.

## Notifications

Create recipient-scoped notifications. Business events go only to authorized
users in that business; affiliate events go only to the affiliate concerned;
platform alerts go to Super Admins. Keep unread state per recipient.

## Security requirements before production

- Add login rate limiting, account lockout policy, password reset and email
  verification flows.
- Use HTTPS, secure secret management, strict CORS, request validation, and
  security headers.
- Prefer short-lived access tokens plus revocable refresh sessions; implement
  logout/revocation before production.
- Avoid logging passwords, tokens, payout destination details, or personal data.
- Add automated tests for role escalation, cross-business data access,
  affiliate ownership, token expiry, inactive accounts, and duplicate commission
  creation.

## Runtime integration still required

1. Mount `createMySqlAuthRouter(process.env.AUTH_TOKEN_SECRET)` in Express
   under `/api/mysql-auth`.
2. Move server startup and all business/affiliate repositories to MySQL in a
   controlled migration; do not simply remove MongoDB before data migration and
   parity tests.
3. Add invitation/bootstrap flows for the first Super Admin. Public signup must
   not allow a client to choose `super_admin` or `finance_admin`.
4. Run migrations and integration tests against a real MySQL 8 instance.
