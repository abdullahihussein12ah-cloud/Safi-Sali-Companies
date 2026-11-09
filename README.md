# Safi Sali Companies

Project organized into separate folders:

- `Frontend/` — existing React + Vite application.
- `Backend/` — starter Node.js + Express API and MongoDB connection.
- `Database/MongoDB/` — MongoDB setup notes and suggested collections.

The supplied archive contained the frontend application; it did not contain a completed backend/API or MongoDB schema. Backend and database folders are therefore starter scaffolding and need integration with frontend features before production use.

## Quick start

1. Start MongoDB locally or create a MongoDB Atlas database.
2. In `Backend/`, copy `.env.example` to `.env`, configure `MONGODB_URI`, and run `npm install`.
3. In `Frontend/`, run `npm install`.
4. From the project root, run `npm install` once, then `npm run dev` to start both development servers together.

### Global business-data reset

The platform dashboard's **Clear all business data** action is restricted to
platform administrators and requires typing the confirmation phrase. It clears
operational workspace records and financial accounts, expenses, and transactions
and subscription payment/verification histories across businesses in one MongoDB
transaction. Business and staff accounts, business settings, registered-business
records, and each license's plan, key, and active/expiry state are preserved;
payment requests and histories are cleared. This action requires MongoDB
transactions, so use a replica-set deployment (including MongoDB Atlas) rather
than a standalone MongoDB server.

### Platform user administration and subscription limits

The configured `super_admin` account is the platform Administrator. It can view
registered accounts across businesses, search/filter role and status, inspect
profiles, review user-management activity, and manage the Recycling Bin.
Business-level administrators retain tenant-scoped user management, but account
deletion, restoration, and permanent removal are reserved for the platform
Administrator. Recycle-bin operations use MongoDB transactions and therefore
require a replica-set deployment.

User and product limits are checked by the backend as well as the frontend.
The seven-day trial and Basic plan allow 3 staff users and 500 products;
Professional allows 11 staff users and unlimited products (the 12th user is
blocked); Enterprise, Annual Enterprise, and Lifetime Enterprise are
unlimited. Annual and lifetime plans continue to use the existing server-side
license expiry and payment verification flow.

Optional external HTTPS checkout links can be configured in
`Frontend/.env` using `VITE_PLAN_BASIC_PURCHASE_URL`,
`VITE_PLAN_PROFESSIONAL_PURCHASE_URL`, `VITE_PLAN_ENTERPRISE_PURCHASE_URL`,
`VITE_PLAN_ANNUAL_PURCHASE_URL`, and `VITE_PLAN_LIFETIME_PURCHASE_URL`. When a
link is not configured, the existing plan-specific USSD purchase flow is used.

## Windows automatic startup

MongoDB must be installed as a Windows service with startup type `Automatic`.
After configuring `Backend/.env` and installing both dependency sets, run
PowerShell as the Windows account that should run the POS, then execute:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-pos-autostart.ps1
```

The scheduled task starts MongoDB if needed, then starts the backend and
frontend when that Windows account signs in. It waits for both services and
opens `http://localhost:3000` in the default browser. The application login
remains required; the startup task does not store or bypass account credentials.
The backend runs with `npm start` so it does not depend on the development file
watcher; the frontend runs with Vite.
Startup logs are written to `%LOCALAPPDATA%\VertexTechPOS\logs`.

## Propose updates to private GitHub repository copies

The `sync-private-repositories` GitHub Actions workflow opens a pull request in
each configured private copy whenever this repository's `main` branch changes.
It never merges pull requests or changes repository visibility. Target
repositories must be copies of this project and must belong to the same GitHub
account or organization as the source repository.

1. Create a GitHub App and install it only on the private target repositories.
   Grant it **Contents: Read and write** and **Pull requests: Read and write**.
2. In the source repository's Actions secrets, set `SYNC_APP_ID` and
   `SYNC_APP_PRIVATE_KEY`.
3. In the source repository's Actions variables, set
   `SYNC_TARGET_REPOSITORIES` to a comma-separated list of target repository
   names (without the owner, for example `POS-Copy-One,POS-Copy-Two`).
4. Push a change to `main`, or run **Propose updates to private repository
   copies** manually from the Actions tab.

The workflow only accepts private targets owned by the source owner. It mirrors
tracked project files into a separate branch and proposes a pull request; review
each PR before merging. If a target already has an open sync PR, that target is
skipped until the PR is merged or closed. The target repository itself is never
deleted, but a full mirror can propose deleting tracked files that are absent
from the source. Secret-like files such as `.env` files (except `.env.example`),
private keys, and common credential files are excluded from the mirror.
