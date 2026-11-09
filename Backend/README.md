# Backend

Node.js + Express API scaffold for Safi Sali Companies.

## Run locally
1. Install Node.js (LTS) and MongoDB.
2. Copy `.env.example` to `.env` and set `MONGODB_URI`, a random `AUTH_TOKEN_SECRET` (at least 32 characters), and the bootstrap administrator credentials. The bootstrap password must be at least 12 characters. Configure separate platform administrator credentials to enable the cross-business dashboard.
3. Install dependencies in both `Backend` and `Frontend`.
4. From `Backend`, run `npm run build`, then `npm run dev`.
5. Check `http://localhost:5000/api/health`.

## Production deployment

Deploy the complete project so the `Backend` and `Frontend` directories are both available to the backend build. Install dependencies in both directories, run `npm --prefix Backend run build`, and start the service with `npm --prefix Backend start`. The backend serves the generated `Frontend/dist` app and all `/api` endpoints from the same origin. Keep the frontend `VITE_API_URL` set to `/api` for this deployment; do not set it to the frontend website origin or leave a stale URL pointing at another service. Deploy the rebuilt frontend and backend together so the Recycling Bin route is included.

The backend build requires the frontend build output to be present in `Frontend/dist`. If deploying the frontend and backend as separate services instead, configure the frontend build-time `VITE_API_URL` to the backend service origin and allow the frontend origin in `FRONTEND_ORIGINS`.

## Email verification and password reset

Self-registered business accounts must verify their email before they can log
in or access protected APIs. Verification and password-reset codes are
six-digit, HMAC-hashed, expire after 10 minutes, and allow five attempts.
Both code types can be resent once per minute. A verified password-reset code
creates a single-use reset authorization that expires after 15 minutes; a
successful password change revokes existing access tokens.

Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`,
`SMTP_FROM_EMAIL`, and `SMTP_FROM_NAME` in `Backend/.env` (see `.env.example`),
then restart the backend. For Gmail, enable 2-Step Verification and create a
Google App Password. Use `smtp.gmail.com`, port `587`, `SMTP_SECURE=false`,
your Gmail address for `SMTP_USER` and `SMTP_FROM_EMAIL`, and the 16-character
App Password for `SMTP_PASS`. Existing `SMTP_PASSWORD` and `SMTP_FROM` settings
are accepted for compatibility. Keep SMTP credentials private and never commit
`Backend/.env`.

The public verification endpoints are `POST /api/auth/send-verification-code`,
`POST /api/auth/verify-email`, and `POST /api/auth/resend-verification-code`.
Password recovery supports `POST /api/auth/forgot-password`,
`POST /api/auth/verify-reset-code`, `POST /api/auth/resend-reset-code`, and
`POST /api/auth/reset-password`. The existing `/password-reset/*` routes remain
available for compatibility. Password reset requires at least 12 characters
including lowercase, uppercase, numeric, and symbol characters.

## License payment verification

The free trial expires after 365 days. Paid plans remain locked until a platform Super Admin verifies the payment transaction and approves its request in the authenticated Administrator Dashboard. Payment requests are stored with unique request and transaction IDs; approval, rejection, expiry, suspension, reactivation, extensions, and plan changes are recorded in the immutable license audit collection. MongoDB must run as a replica set to support the transaction-backed payment and administrator workflows.

The application refreshes license state from server timestamps, locks protected workspace reads and writes after expiry, and leaves license status, plan selection, and authorized support routes available while locked. Plan prices, durations, and user/product limits are persisted in the subscription plan collection and enforced on the backend.

## Recycling Bin

Business Administrators can move products, customers, suppliers, categories, sales, purchases, ledgers, inventory movements, payroll, attendance, and leave records into the tenant Recycling Bin. Delete operations, bin edits, restores, and permanent removals are stored with actor and timestamp audit records. Only the business owner/admin roles can view, edit, restore, or permanently delete bin entries; other roles may recycle records only when their existing module permissions allow it. Restore keeps original record IDs and skips conflicting IDs or product identifiers. Restore All and Delete All are processed in bounded transactional batches. MongoDB must run as a replica set for these operations.

Authenticated accounts now use separate workspaces for settings, products, stock, customers, suppliers, sales, purchases, and ledgers. Workspace reads and writes are scoped to the signed-in account; newly created staff accounts start with empty business data. Only the system license remains shared.

Existing records in the former shared workspace are not automatically assigned to user accounts. Back up and explicitly import any records you need before deploying this change.

The API is still a partial integration for the remaining frontend features; review those features before production use.

## Business role permissions

New business registrations receive the Business Owner role. Business Owners can manage users and business settings within their tenant; they cannot access the platform license-administration endpoints. Super Admin is reserved for Safi Sali Companies operators and cannot be assigned through the business user API.

Set `PLATFORM_ADMIN_EMAIL`, `PLATFORM_ADMIN_NAME`, and `PLATFORM_ADMIN_PASSWORD` together to provision a separate platform-only account at startup. The password must be at least 12 characters. A platform administrator can view each tenant's license status, verified subscription payment history, and individually listed sales activity from `/api/super-admin`; business accounts cannot access these endpoints or create platform administrators. Approved subscription payments are recorded in the tenant license history for the dashboard.

Business Administrators can review every team member's invoice sales and items from the business dashboard. Team activity is limited to the signed-in tenant and requires the `reports` permission.

The Users & Roles page reads and updates the tenant's role-permission matrix through `GET` and `PUT /api/workspace/role-permissions`. The backend validates the configured roles and permission keys, filters workspace reads by role, and checks permissions on workspace writes and financial reports. Cashier defaults allow point-of-sale access, Accountant defaults allow financial reports, and Inventory Manager defaults allow inventory and purchasing. License administration endpoints require a valid authenticated platform Super Admin session.

## Accounting and reconciliation

Financial users with the `financial_reports` permission can create cash or bank accounts, record account income and expenses, and reconcile ledger transactions through `/api/accounting`. Reconciled entries are immutable; corrections must be recorded as separately linked adjustments with a reason, creator, and timestamp. The report period filters sales, purchases, expenses, payroll, and ledger entries. Profit and loss keeps sales revenue, COGS, gross profit, operating expenses, other income, and net profit separate; net profit is gross profit plus other income less expenses and payroll. Purchase costs are shown separately from COGS, while customer receivables and supplier payables are outstanding invoice balances as of the selected period end.
