import { Router } from 'express';
import mongoose from 'mongoose';
import { UserModel } from '../models/User.js';
import { UserActivityModel } from '../models/UserActivity.js';
import { LicenseAuditModel } from '../models/LicenseAudit.js';
import { LicensePaymentRequestModel } from '../models/LicensePaymentRequest.js';
import { DEFAULT_SUBSCRIPTION_PLANS, SubscriptionPlanModel } from '../models/SubscriptionPlan.js';
import { WorkspaceModel } from '../models/Workspace.js';
import { setLicenseLimits, TRIAL_DURATION_DAYS } from '../licenseLimits.js';
import { getCurrentLicense, LICENSE_PLANS, makeActivatedLicense } from './workspace.js';

const BUSINESS_OWNER_ROLES = ['admin', 'business_owner'];

function getTenantFilter(tenantId) {
  return tenantId === 'business'
    ? { $or: [{ tenantId: 'business' }, { tenantId: { $exists: false } }] }
    : { tenantId };
}

function getPaymentHistory(license) {
  if (Array.isArray(license?.paymentHistory)) return license.paymentHistory;
  const lastPayment = license?.pendingPaymentRequest;
  if (
    lastPayment?.status === 'approved' &&
    typeof lastPayment.requestId === 'string' &&
    Number.isFinite(lastPayment.priceUSD)
  ) {
    return [{
      requestId: lastPayment.requestId,
      planId: lastPayment.planId,
      planName: lastPayment.planName,
      priceUSD: lastPayment.priceUSD,
      trxId: lastPayment.trxId,
      submittedAt: lastPayment.submittedAt,
      approvedAt: lastPayment.approvedAt || '',
    }];
  }
  return [];
}

function toTeamSale(sale, user) {
  if (!sale || typeof sale !== 'object') return null;
  return {
    id: typeof sale.id === 'string' ? sale.id : '',
    invoiceNumber: typeof sale.invoiceNumber === 'string' ? sale.invoiceNumber : '',
    date: typeof sale.date === 'string' ? sale.date : '',
    cashierId: typeof sale.cashierId === 'string' ? sale.cashierId : String(user._id),
    cashierName: typeof sale.cashierName === 'string' && sale.cashierName
      ? sale.cashierName
      : user.name,
    cashierRole: user.role,
    items: Array.isArray(sale.items)
      ? sale.items.map((item) => ({
          productName: typeof item?.productName === 'string' ? item.productName : '',
          quantity: Number.isFinite(item?.quantity) ? item.quantity : 0,
        }))
      : [],
    totalAmount: Number.isFinite(sale.totalAmount) ? sale.totalAmount : 0,
    paymentStatus: typeof sale.paymentStatus === 'string' ? sale.paymentStatus : 'unpaid',
    currency: typeof sale.currency === 'string' ? sale.currency : 'USD',
  };
}

function compareSaleDateDescending(left, right) {
  return right.date.localeCompare(left.date);
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function platformUser(user, businessName, plan) {
  const document = user.toObject ? user.toObject() : user;
  return {
    id: String(document._id),
    tenantId: document.tenantId || 'business',
    businessName,
    planName: typeof plan?.planName === 'string' ? plan.planName : 'No active plan',
    planId: typeof plan?.planId === 'string' ? plan.planId : '',
    name: document.name,
    email: document.email,
    phone: document.phone || '',
    role: document.role,
    active: document.active,
    createdAt: document.createdAt?.toISOString?.() || '',
    createdBy: document.createdBy || '',
    createdByName: document.createdByName || '',
    deletedAt: document.deletedAt?.toISOString?.() || '',
    deletedBy: document.deletedBy || '',
    deletedByName: document.deletedByName || '',
    dateOfBirth: document.dateOfBirth || '',
    address: document.address || '',
    jobTitle: document.jobTitle || '',
    monthlySalary: document.monthlySalary || 0,
    employeeDetails: document.employeeDetails || {},
  };
}

export function createSuperAdminRouter() {
  const router = Router();

  router.use((req, res, next) => {
    if (req.user?.role === 'super_admin') return next();
    return res.status(403).json({ error: 'Platform administrator access required.' });
  });

  router.get('/users', async (req, res, next) => {
    try {
      const { view = 'active', search = '', role = '', status = '' } = req.query;
      if (
        !['active', 'deleted'].includes(view) ||
        typeof search !== 'string' ||
        typeof role !== 'string' ||
        !['', 'active', 'inactive'].includes(status)
      ) {
        return res.status(400).json({ error: 'User filters are invalid.' });
      }
      const page = Math.max(1, Number.parseInt(String(req.query.page || '1'), 10) || 1);
      const pageSize = Math.min(100, Math.max(1, Number.parseInt(String(req.query.pageSize || '50'), 10) || 50));
      const filter = view === 'deleted' ? { deletedAt: { $ne: null } } : { deletedAt: null };
      if (status) filter.active = status === 'active';
      if (role) {
        const validRoles = [
          'admin', 'manager', 'cashier', 'accountant', 'business_owner', 'business_admin',
          'branch_manager', 'inventory_manager', 'hr_manager', 'employee', 'super_admin',
        ];
        if (!validRoles.includes(role)) return res.status(400).json({ error: 'User role filter is invalid.' });
        filter.role = role;
      }
      if (search.trim()) {
        const expression = new RegExp(escapeRegex(search.trim()).slice(0, 120), 'i');
        filter.$or = [
          { name: expression },
          { email: expression },
          { phone: expression },
          { tenantId: expression },
          { role: expression },
        ];
      }
      const [users, total] = await Promise.all([
        UserModel.aggregate([
          { $match: filter },
          {
            $addFields: {
              roleOrder: {
                $switch: {
                  branches: [
                    { case: { $eq: ['$role', 'super_admin'] }, then: 0 },
                    { case: { $in: ['$role', ['admin', 'business_owner']] }, then: 1 },
                    { case: { $eq: ['$role', 'business_admin'] }, then: 2 },
                    { case: { $eq: ['$role', 'cashier'] }, then: 3 },
                    { case: { $eq: ['$role', 'accountant'] }, then: 4 },
                  ],
                  default: 5,
                },
              },
            },
          },
          { $sort: { roleOrder: 1, name: 1, _id: 1 } },
          { $skip: (page - 1) * pageSize },
          { $limit: pageSize },
          {
            $project: {
              passwordHash: 0,
              passwordResetTokenHash: 0,
              passwordResetExpiresAt: 0,
              roleOrder: 0,
            },
          },
        ]),
        UserModel.countDocuments(filter),
      ]);
      const tenantIds = [...new Set(users.map((user) => user.tenantId || 'business'))];
      const [owners, workspaces] = await Promise.all([
        UserModel.find({ tenantId: { $in: tenantIds }, role: { $in: BUSINESS_OWNER_ROLES } })
          .select('_id tenantId name')
          .lean(),
        WorkspaceModel.find({ ownerId: { $in: tenantIds }, scope: 'shared' })
          .select('ownerId data.server_license')
          .lean(),
      ]);
      const ownerNameByTenant = new Map(owners.map((owner) => [owner.tenantId || 'business', owner.name]));
      const licenseByTenant = new Map(workspaces.map((workspace) => [
        workspace.ownerId,
        workspace.data?.server_license || null,
      ]));
      const rows = users.map((user) => {
        const tenantId = user.tenantId || 'business';
        const license = licenseByTenant.get(tenantId);
        const name = ownerNameByTenant.get(tenantId);
        return platformUser(user, name || tenantId, license);
      });
      return res.json({
        users: rows,
        pagination: { page, pageSize, total, pageCount: Math.ceil(total / pageSize) },
      });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/user-activity', async (req, res, next) => {
    try {
      const page = Math.max(1, Number.parseInt(String(req.query.page || '1'), 10) || 1);
      const pageSize = Math.min(100, Math.max(1, Number.parseInt(String(req.query.pageSize || '50'), 10) || 50));
      const [events, total] = await Promise.all([
        UserActivityModel.find()
          .sort({ occurredAt: -1 })
          .skip((page - 1) * pageSize)
          .limit(pageSize)
          .lean(),
        UserActivityModel.countDocuments(),
      ]);
      return res.json({
        events: events.map((event) => ({
          id: String(event._id),
          action: event.action,
          actorId: event.actorId,
          actorName: event.actorName,
          targetUserId: event.targetUserId,
          targetName: event.targetName,
          targetEmail: event.targetEmail,
          targetRole: event.targetRole,
          tenantId: event.tenantId,
          occurredAt: event.occurredAt?.toISOString?.() || '',
        })),
        pagination: { page, pageSize, total, pageCount: Math.ceil(total / pageSize) },
      });
    } catch (error) {
      return next(error);
    }
  });

  router.patch('/users/:id', async (req, res, next) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: 'User ID is invalid.' });
    }
    const { name, email, phone, role, active } = req.body || {};
    const validRoles = [
      'admin', 'manager', 'cashier', 'accountant', 'business_owner', 'business_admin',
      'branch_manager', 'inventory_manager', 'hr_manager', 'employee', 'super_admin',
    ];
    if (
      typeof name !== 'string' || !name.trim() || name.trim().length > 120 ||
      typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || email.trim().length > 254 ||
      typeof phone !== 'string' || phone.trim().length > 40 ||
      !validRoles.includes(role) ||
      typeof active !== 'boolean'
    ) {
      return res.status(400).json({ error: 'User name, email, phone, role, or status is invalid.' });
    }
    try {
      let updatedUser;
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          const user = await UserModel.findOne({ _id: req.params.id, deletedAt: null }).session(session);
          if (!user) throw Object.assign(new Error('Active user was not found.'), { statusCode: 404 });
          if (String(user._id) === String(req.user._id) && (role !== 'super_admin' || !active)) {
            throw Object.assign(new Error('You cannot demote or deactivate your own Administrator account.'), {
              statusCode: 403,
            });
          }
          if (user.role === 'super_admin' && user.active && (role !== 'super_admin' || !active)) {
            const activeAdministrators = await UserModel.countDocuments({
              role: 'super_admin',
              active: true,
              deletedAt: null,
            }).session(session);
            if (activeAdministrators <= 1) {
              throw Object.assign(new Error('The last active platform Administrator cannot be demoted or deactivated.'), {
                statusCode: 409,
              });
            }
          }
          const previousRole = user.role;
          const previousActive = user.active;
          if (role === 'super_admin' && user.role !== 'super_admin') {
            throw Object.assign(new Error('Platform Administrator role cannot be assigned to business accounts.'), {
              statusCode: 403,
            });
          }
          user.name = name.trim();
          user.email = email.trim().toLowerCase();
          user.phone = phone.trim();
          user.role = role;
          user.active = active;
          if (previousRole !== role || previousActive !== active) user.tokenVersion += 1;
          await user.save({ session });
          await UserActivityModel.create([{
            action: 'user_updated',
            actorId: String(req.user._id),
            actorName: req.user.name,
            targetUserId: String(user._id),
            targetName: user.name,
            targetEmail: user.email,
            targetRole: user.role,
            tenantId: user.tenantId || 'business',
          }], { session });
          updatedUser = user;
        });
      } finally {
        await session.endSession();
      }
      const [owner, workspace] = await Promise.all([
        UserModel.findOne({ tenantId: updatedUser.tenantId || 'business', role: { $in: BUSINESS_OWNER_ROLES } })
          .select('_id tenantId name')
          .sort({ createdAt: 1 })
          .lean(),
        WorkspaceModel.findOne({ ownerId: updatedUser.tenantId || 'business', scope: 'shared' })
          .select('data.server_license')
          .lean(),
      ]);
      return res.json({
        user: platformUser(
          updatedUser,
          owner?.name || updatedUser.tenantId || 'business',
          workspace?.data?.server_license
        ),
      });
    } catch (error) {
      if (error?.code === 11000) return res.status(409).json({ error: 'An account with this email already exists.' });
      if (error?.statusCode) return res.status(error.statusCode).json({ error: error.message });
      return next(error);
    }
  });

  router.delete('/users/:id', async (req, res, next) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: 'User ID is invalid.' });
    }
    if (String(req.params.id) === String(req.user._id)) {
      return res.status(403).json({ error: 'You cannot delete your own account.' });
    }
    let session;
    try {
      session = await mongoose.startSession();
      let outcome = 'deleted';
      await session.withTransaction(async () => {
        const user = await UserModel.findById(req.params.id).session(session);
        if (!user || user.deletedAt) {
          outcome = 'not-found';
          return;
        }
        if (user.role === 'super_admin' && user.active) {
          const activeAdministrators = await UserModel.countDocuments({
            role: 'super_admin',
            active: true,
            deletedAt: null,
          }).session(session);
          if (activeAdministrators <= 1) {
            outcome = 'last-administrator';
            return;
          }
        }
        user.wasActiveBeforeDeletion = user.active;
        user.deletedAt = new Date();
        user.deletedBy = String(req.user._id);
        user.deletedByName = req.user.name;
        user.active = false;
        user.tokenVersion += 1;
        await user.save({ session });
        await UserActivityModel.create([{
          action: 'user_deleted',
          actorId: String(req.user._id),
          actorName: req.user.name,
          targetUserId: String(user._id),
          targetName: user.name,
          targetEmail: user.email,
          targetRole: user.role,
          tenantId: user.tenantId || 'business',
        }], { session });
      });
      if (outcome === 'not-found') return res.status(404).json({ error: 'User not found or already deleted.' });
      if (outcome === 'last-administrator') {
        return res.status(409).json({ error: 'The last active platform Administrator cannot be deleted.' });
      }
      return res.json({ deleted: true });
    } catch (error) {
      return next(error);
    } finally {
      if (session) await session.endSession();
    }
  });

  router.post('/users/:id/restore', async (req, res, next) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: 'User ID is invalid.' });
    }
    let session;
    try {
      session = await mongoose.startSession();
      let restored = false;
      await session.withTransaction(async () => {
        const user = await UserModel.findOne({ _id: req.params.id, deletedAt: { $ne: null } }).session(session);
        if (!user) return;
        user.active = user.wasActiveBeforeDeletion;
        user.deletedAt = null;
        user.deletedBy = '';
        user.deletedByName = '';
        user.tokenVersion += 1;
        await user.save({ session });
        await UserActivityModel.create([{
          action: 'user_restored',
          actorId: String(req.user._id),
          actorName: req.user.name,
          targetUserId: String(user._id),
          targetName: user.name,
          targetEmail: user.email,
          targetRole: user.role,
          tenantId: user.tenantId || 'business',
        }], { session });
        restored = true;
      });
      if (!restored) return res.status(404).json({ error: 'Deleted user was not found.' });
      return res.json({ restored: true });
    } catch (error) {
      return next(error);
    } finally {
      if (session) await session.endSession();
    }
  });

  router.delete('/users/:id/permanent', async (req, res, next) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: 'User ID is invalid.' });
    }
    if (String(req.params.id) === String(req.user._id)) {
      return res.status(403).json({ error: 'You cannot permanently delete your own account.' });
    }
    let session;
    try {
      session = await mongoose.startSession();
      let removed = false;
      await session.withTransaction(async () => {
        const user = await UserModel.findOne({ _id: req.params.id, deletedAt: { $ne: null } }).session(session);
        if (!user) return;
        await UserActivityModel.create([{
          action: 'user_permanently_deleted',
          actorId: String(req.user._id),
          actorName: req.user.name,
          targetUserId: String(user._id),
          targetName: user.name,
          targetEmail: user.email,
          targetRole: user.role,
          tenantId: user.tenantId || 'business',
        }], { session });
        await UserModel.deleteOne({ _id: user._id }, { session });
        removed = true;
      });
      if (!removed) return res.status(404).json({ error: 'Deleted user was not found.' });
      return res.json({ permanentlyDeleted: true });
    } catch (error) {
      return next(error);
    } finally {
      if (session) await session.endSession();
    }
  });

  router.get('/dashboard', async (_req, res, next) => {
    try {
      const owners = await UserModel.find({
        role: { $in: BUSINESS_OWNER_ROLES },
        tenantId: { $ne: 'platform' },
        deletedAt: null,
      }).select('_id tenantId name email phone').sort({ createdAt: 1 }).lean();
      const tenantIds = [...new Set(owners.map((owner) => owner.tenantId || 'business'))];
      if (!tenantIds.length) return res.json({ businesses: [] });

      const [tenantUsers, sharedWorkspaces] = await Promise.all([
        UserModel.find({
          $or: tenantIds.map(getTenantFilter),
          role: { $ne: 'super_admin' },
          deletedAt: null,
        }).select('_id tenantId name email phone role active').lean(),
        WorkspaceModel.find({
          ownerId: { $in: tenantIds },
          scope: 'shared',
        }).select('ownerId data.server_license').lean(),
      ]);
      const userIds = tenantUsers.map((user) => String(user._id));
      const userWorkspaces = userIds.length
        ? await WorkspaceModel.find({
            ownerId: { $in: userIds },
            scope: 'user',
          }).select('ownerId data.settings data.sales').lean()
        : [];
      const ownerByTenant = new Map(
        owners.map((owner) => [owner.tenantId || 'business', owner])
      );
      const usersByTenant = new Map();
      tenantUsers.forEach((user) => {
        const tenantId = user.tenantId || 'business';
        const group = usersByTenant.get(tenantId) || [];
        group.push(user);
        usersByTenant.set(tenantId, group);
      });
      const workspaceByTenant = new Map(sharedWorkspaces.map((workspace) => [workspace.ownerId, workspace]));
      const userWorkspaceById = new Map(userWorkspaces.map((workspace) => [workspace.ownerId, workspace]));

      const businesses = tenantIds.map((tenantId) => {
        const owner = ownerByTenant.get(tenantId);
        const users = usersByTenant.get(tenantId) || [];
        const license = workspaceByTenant.get(tenantId)?.data?.server_license || null;
        const ownerWorkspace = userWorkspaceById.get(String(owner?._id));
        const businessName = ownerWorkspace?.data?.settings?.businessName;
        const expiryValue = typeof license?.expiryDate === 'string'
          ? license.expiryDate.trim().replace(' ', 'T')
          : '';
        const expiryHasTimezone = /(?:Z|[+-]\d{2}:\d{2})$/i.test(expiryValue);
        const expiryTime = expiryValue
          ? new Date(expiryHasTimezone ? expiryValue : `${expiryValue}Z`).getTime()
          : Number.NaN;
        const isExpired = license?.planId !== 'plan-lifetime' &&
          (!Number.isFinite(expiryTime) || expiryTime <= Date.now());
        const isActive = license?.isActive === true && license?.isLocked !== true && !isExpired;
        const salesByCurrency = new Map();
        let salesCount = 0;
        users.forEach((user) => {
          const sales = userWorkspaceById.get(String(user._id))?.data?.sales;
          if (!Array.isArray(sales)) return;
          sales.forEach((sale) => {
            if (!sale || sale.paymentStatus === 'refunded' || !Number.isFinite(sale.totalAmount)) return;
            const currency = typeof sale.currency === 'string' ? sale.currency : 'USD';
            salesByCurrency.set(currency, (salesByCurrency.get(currency) || 0) + sale.totalAmount);
            salesCount += 1;
          });
        });
        const payments = getPaymentHistory(license);

        return {
          tenantId,
          businessName: typeof businessName === 'string' && businessName.trim()
            ? businessName.trim()
            : owner?.name || tenantId,
          ownerName: owner?.name || '',
          ownerEmail: owner?.email || '',
          ownerPhone: owner?.phone || '',
          userCount: users.length,
          activeUserCount: users.filter((user) => user.active).length,
          plan: license
            ? {
                id: typeof license.planId === 'string' ? license.planId : '',
                name: typeof license.planName === 'string' ? license.planName : '',
                status: isExpired
                  ? 'EXPIRED'
                  : typeof license.status === 'string'
                    ? license.status
                    : 'UNKNOWN',
                isActive,
                activationDate: typeof license.activationDate === 'string' ? license.activationDate : '',
                expiryDate: typeof license.expiryDate === 'string' ? license.expiryDate : '',
              }
            : null,
          pendingPaymentRequest: license?.pendingPaymentRequest?.status === 'pending'
            ? {
                requestId: license.pendingPaymentRequest.requestId,
                planId: license.pendingPaymentRequest.planId,
                planName: license.pendingPaymentRequest.planName,
                priceUSD: license.pendingPaymentRequest.priceUSD,
                trxId: license.pendingPaymentRequest.trxId,
                submittedAt: license.pendingPaymentRequest.submittedAt,
              }
            : null,
          rejectedPaymentRequest: license?.pendingPaymentRequest?.status === 'rejected'
              ? {
                  requestId: license.pendingPaymentRequest.requestId,
                  planId: license.pendingPaymentRequest.planId,
                  planName: license.pendingPaymentRequest.planName,
                  priceUSD: license.pendingPaymentRequest.priceUSD,
                  trxId: license.pendingPaymentRequest.trxId,
                  submittedAt: license.pendingPaymentRequest.submittedAt,
                  decidedAt: license.pendingPaymentRequest.rejectedAt || '',
                  status: 'rejected',
                  decidedBy: license.pendingPaymentRequest.rejectedBy || '',
                }
              : null,
          payments,
          verificationHistory: Array.isArray(license?.verificationHistory)
            ? license.verificationHistory.map((event) => ({
                requestId: typeof event.requestId === 'string' ? event.requestId : '',
                planId: typeof event.planId === 'string' ? event.planId : '',
                planName: typeof event.planName === 'string' ? event.planName : '',
                priceUSD: Number.isFinite(event.priceUSD) ? event.priceUSD : 0,
                trxId: typeof event.trxId === 'string' ? event.trxId : '',
                submittedAt: typeof event.submittedAt === 'string' ? event.submittedAt : '',
                decidedAt: typeof event.decidedAt === 'string' ? event.decidedAt : '',
                status: event.status === 'approved' || event.status === 'rejected' ? event.status : 'pending',
                decidedBy: typeof event.decidedBy === 'string' ? event.decidedBy : '',
              }))
            : [],
          totalPaidUSD: payments.reduce(
            (total, payment) => total + (Number.isFinite(payment.priceUSD) ? payment.priceUSD : 0),
            0
          ),
          salesCount,
          salesTotals: [...salesByCurrency.entries()].map(([currency, amount]) => ({ currency, amount })),
        };
      });

      return res.json({ businesses });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/businesses/:tenantId/activity', async (req, res, next) => {
    try {
      const page = Number(req.query.page ?? 1);
      const pageSize = Number(req.query.pageSize ?? 50);
      if (
        !Number.isInteger(page) ||
        page < 1 ||
        !Number.isInteger(pageSize) ||
        pageSize < 1 ||
        pageSize > 100
      ) {
        return res.status(400).json({ error: 'Page must be positive and pageSize must be between 1 and 100.' });
      }

      const tenantId = req.params.tenantId;
      if (!tenantId || tenantId === 'platform') {
        return res.status(400).json({ error: 'Business workspace ID is invalid.' });
      }
      const users = await UserModel.find({
        ...getTenantFilter(tenantId),
        role: { $ne: 'super_admin' },
      }).select('_id tenantId name email role active').lean();
      if (!users.length) return res.status(404).json({ error: 'Business workspace was not found.' });

      const workspaces = await WorkspaceModel.find({
        ownerId: { $in: users.map((user) => String(user._id)) },
        scope: 'user',
      }).select('ownerId data.sales').lean();
      const salesByUser = new Map(workspaces.map((workspace) => [workspace.ownerId, workspace.data?.sales]));
      const sales = users.flatMap((user) => {
        const userSales = salesByUser.get(String(user._id));
        return Array.isArray(userSales)
          ? userSales.map((sale) => toTeamSale(sale, user)).filter(Boolean)
          : [];
      }).sort(compareSaleDateDescending);
      const start = (page - 1) * pageSize;
      return res.json({
        sales: sales.slice(start, start + pageSize),
        pagination: {
          page,
          pageSize,
          total: sales.length,
          pageCount: Math.ceil(sales.length / pageSize),
        },
      });

    } catch (error) {
      return next(error);
    }
  });

  router.post('/license-requests/:requestId/:decision', async (req, res, next) => {
    try {
      const { requestId, decision } = req.params;
      if (!requestId || !['approve', 'reject'].includes(decision)) {
        return res.status(400).json({ error: 'A request ID and valid license decision are required.' });
      }
      const workspace = await WorkspaceModel.findOne({
        scope: 'shared',
        'data.server_license.pendingPaymentRequest.requestId': requestId,
        'data.server_license.pendingPaymentRequest.status': 'pending',
      });
      if (!workspace) {
        return res.status(404).json({ error: 'The pending license payment request was not found.' });
      }

      const license = await getCurrentLicense(workspace);
      const request = license?.pendingPaymentRequest;
      if (!request || request.status !== 'pending') {
        return res.status(409).json({ error: 'The license payment request is no longer pending.' });
      }

      const now = new Date();
      const historyEvent = {
        requestId: request.requestId,
        planId: request.planId,
        planName: request.planName,
        priceUSD: request.priceUSD,
        trxId: request.trxId,
        submittedAt: request.submittedAt,
        decidedAt: now.toISOString(),
        status: decision === 'approve' ? 'approved' : 'rejected',
        decidedBy: String(req.user._id),
      };
      const verificationHistory = [
        ...(Array.isArray(license.verificationHistory) ? license.verificationHistory : []),
        historyEvent,
      ];

      let updatedLicense;
      if (decision === 'approve') {
        const catalogPlan = LICENSE_PLANS[request.planId];
        if (!catalogPlan) {
          return res.status(409).json({ error: 'The requested license plan is no longer available.' });
        }
        updatedLicense = {
          ...makeActivatedLicense(license, request, {
            ...catalogPlan,
            name: request.planName,
            price: request.priceUSD,
            durationDays: request.durationDays,
          }, now),
          verificationHistory,
        };
      } else {
        updatedLicense = {
          ...license,
          verificationHistory,
          pendingPaymentRequest: {
            ...request,
            status: 'rejected',
            rejectedAt: now.toISOString(),
            rejectedBy: String(req.user._id),
          },
        };
      }
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          const currentWorkspace = await WorkspaceModel.findOne({
            _id: workspace._id,
            'data.server_license.pendingPaymentRequest.requestId': requestId,
            'data.server_license.pendingPaymentRequest.status': 'pending',
          }).session(session);
          if (!currentWorkspace) {
            throw Object.assign(new Error('The payment request changed before the decision was saved.'), {
              statusCode: 409,
            });
          }
          const paymentRecord = await LicensePaymentRequestModel.findOne({
            requestId,
            status: 'pending',
          }).session(session);
          if (paymentRecord) {
            paymentRecord.status = historyEvent.status;
            if (decision === 'approve') {
              paymentRecord.approvedAt = now;
              paymentRecord.approvedBy = String(req.user._id);
            } else {
              paymentRecord.rejectedAt = now;
              paymentRecord.rejectedBy = String(req.user._id);
            }
            await paymentRecord.save({ session });
          } else {
            await LicensePaymentRequestModel.create([{
              requestId: request.requestId,
              tenantId: workspace.ownerId,
              requestedBy: request.submittedBy || 'legacy',
              planId: request.planId,
              planName: request.planName,
              priceUSD: request.priceUSD,
              durationDays: request.durationDays || LICENSE_PLANS[request.planId].durationDays,
              trxId: request.trxId,
              submittedAt: new Date(request.submittedAt),
              status: historyEvent.status,
              ...(decision === 'approve'
                ? { approvedAt: now, approvedBy: String(req.user._id) }
                : { rejectedAt: now, rejectedBy: String(req.user._id) }),
            }], { session });
          }
          currentWorkspace.data.server_license = updatedLicense;
          currentWorkspace.markModified('data');
          await currentWorkspace.save({ session });
          await LicenseAuditModel.create([{
            tenantId: workspace.ownerId,
            actorId: String(req.user._id),
            actorName: req.user.name,
            action: decision === 'approve' ? 'payment_approved' : 'payment_rejected',
            requestId,
            occurredAt: now,
            details: { planId: request.planId, priceUSD: request.priceUSD, trxId: request.trxId },
          }], { session });
        });
      } finally {
        await session.endSession();
      }
      return res.json({ decided: true, status: historyEvent.status });
    } catch (error) {
      if (error?.code === 11000) {
        return res.status(409).json({ error: 'This payment request has already been processed.' });
      }
      if (error?.statusCode === 409) {
        return res.status(409).json({ error: error.message });
      }
      return next(error);
    }
  });

  router.get('/license-audit', async (req, res, next) => {
    try {
      const page = Math.max(1, Number.parseInt(String(req.query.page || '1'), 10) || 1);
      const pageSize = Math.min(100, Math.max(1, Number.parseInt(String(req.query.pageSize || '50'), 10) || 50));
      const filter = typeof req.query.tenantId === 'string' && req.query.tenantId
        ? { tenantId: req.query.tenantId }
        : {};
      const [events, total] = await Promise.all([
        LicenseAuditModel.find(filter)
          .sort({ occurredAt: -1, _id: -1 })
          .skip((page - 1) * pageSize)
          .limit(pageSize)
          .lean(),
        LicenseAuditModel.countDocuments(filter),
      ]);
      return res.json({
        events: events.map((event) => ({
          id: String(event._id),
          tenantId: event.tenantId,
          actorId: event.actorId,
          actorName: event.actorName,
          action: event.action,
          requestId: event.requestId,
          occurredAt: event.occurredAt?.toISOString?.() || '',
          details: event.details || {},
        })),
        pagination: { page, pageSize, total, pageCount: Math.ceil(total / pageSize) },
      });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/subscription-plans', async (_req, res, next) => {
    try {
      const plans = await SubscriptionPlanModel.find({
        planId: { $in: DEFAULT_SUBSCRIPTION_PLANS.map((plan) => plan.planId) },
      }).sort({ planId: 1 }).lean();
      return res.json({
        plans: plans.map((plan) => ({
          planId: plan.planId,
          name: plan.name,
          priceUSD: plan.priceUSD,
          durationDays: plan.durationDays,
          userLimit: plan.userLimit,
          productLimit: plan.productLimit,
          billingPeriod: plan.billingPeriod,
          enabled: plan.enabled,
        })),
      });
    } catch (error) {
      return next(error);
    }
  });

  router.put('/subscription-plans/:planId', async (req, res, next) => {
    const planId = req.params.planId;
    const defaults = DEFAULT_SUBSCRIPTION_PLANS.find((plan) => plan.planId === planId);
    const { name, priceUSD, durationDays, userLimit, productLimit } = req.body || {};
    if (
      !defaults ||
      typeof name !== 'string' || !name.trim() || name.trim().length > 100 ||
      !Number.isFinite(priceUSD) || priceUSD < 0 ||
      !Number.isInteger(durationDays) || durationDays < 0 || durationDays > 36500 ||
      !(userLimit === null || (Number.isSafeInteger(userLimit) && userLimit >= 1)) ||
      !(productLimit === null || (Number.isSafeInteger(productLimit) && productLimit >= 1)) ||
      (planId === 'plan-trial' && (priceUSD !== 0 || durationDays !== TRIAL_DURATION_DAYS)) ||
      (planId === 'plan-lifetime' && durationDays !== 0) ||
      (planId !== 'plan-lifetime' && durationDays === 0)
    ) {
      return res.status(400).json({ error: 'Subscription plan settings are invalid.' });
    }

    const session = await mongoose.startSession();
    try {
      let updatedPlan;
      const occurredAt = new Date();
      await session.withTransaction(async () => {
        updatedPlan = await SubscriptionPlanModel.findOneAndUpdate(
          { planId },
          {
            $set: {
              name: name.trim(),
              priceUSD,
              durationDays,
              userLimit,
              productLimit,
            },
          },
          { new: true, runValidators: true, session }
        );
        if (!updatedPlan) {
          throw Object.assign(new Error('Subscription plan was not found.'), { statusCode: 404 });
        }
        await LicenseAuditModel.create([{
          tenantId: 'platform',
          actorId: String(req.user._id),
          actorName: req.user.name,
          action: 'plan_updated',
          occurredAt,
          details: { planId, name: name.trim(), priceUSD, durationDays, userLimit, productLimit },
        }], { session });
      });
      setLicenseLimits(planId, {
        users: Number.isSafeInteger(updatedPlan.userLimit)
          ? updatedPlan.userLimit
          : Number.POSITIVE_INFINITY,
        products: Number.isSafeInteger(updatedPlan.productLimit)
          ? updatedPlan.productLimit
          : Number.POSITIVE_INFINITY,
      });
      return res.json({
        plan: {
          planId: updatedPlan.planId,
          name: updatedPlan.name,
          priceUSD: updatedPlan.priceUSD,
          durationDays: updatedPlan.durationDays,
          userLimit: updatedPlan.userLimit,
          productLimit: updatedPlan.productLimit,
          billingPeriod: updatedPlan.billingPeriod,
          enabled: updatedPlan.enabled,
        },
      });
    } catch (error) {
      if (error?.statusCode) return res.status(error.statusCode).json({ error: error.message });
      return next(error);
    } finally {
      await session.endSession();
    }
  });

  router.post('/businesses/:tenantId/license/:action', async (req, res, next) => {
    const { tenantId, action } = req.params;
    if (!tenantId || tenantId === 'platform' || !['suspend', 'reactivate', 'extend'].includes(action)) {
      return res.status(400).json({ error: 'A valid business and license action are required.' });
    }
    if (
      action === 'extend' &&
      (!Number.isInteger(req.body?.days) || req.body.days < 1 || req.body.days > 3650)
    ) {
      return res.status(400).json({ error: 'License extensions must be between 1 and 3650 days.' });
    }

    const session = await mongoose.startSession();
    try {
      let updatedLicense;
      await session.withTransaction(async () => {
        const workspace = await WorkspaceModel.findOne({
          ownerId: tenantId,
          scope: 'shared',
        }).session(session);
        const license = await getCurrentLicense(workspace);
        if (!workspace || !license) {
          throw Object.assign(new Error('The business license was not found.'), { statusCode: 404 });
        }

        const now = new Date();
        const expiry = parseLicenseDate(license.expiryDate);
        if (action === 'suspend') {
          if (license.status === 'EXPIRED') {
            throw Object.assign(new Error('An expired license cannot be suspended.'), { statusCode: 409 });
          }
          updatedLicense = {
            ...license,
            isActive: false,
            isLocked: true,
            lockedReason: 'License suspended by platform administrator',
            status: 'SUSPENDED',
            serverTimestamp: now.toISOString(),
          };
        } else if (action === 'reactivate') {
          if (
            license.planId !== 'plan-lifetime' &&
            (!Number.isFinite(expiry) || expiry <= now.getTime())
          ) {
            throw Object.assign(new Error('Expired licenses must be renewed through verified payment approval.'), {
              statusCode: 409,
            });
          }
          updatedLicense = {
            ...license,
            isActive: true,
            isLocked: false,
            lockedReason: '',
            status: 'ACTIVE',
            serverTimestamp: now.toISOString(),
          };
        } else {
          if (license.planId === 'plan-lifetime') {
            throw Object.assign(new Error('Lifetime licenses do not expire and cannot be extended.'), {
              statusCode: 409,
            });
          }
          const base = Number.isFinite(expiry) && expiry > now.getTime() ? expiry : now.getTime();
          const expiryDate = new Date(base + req.body.days * 86400000);
          updatedLicense = {
            ...license,
            isActive: true,
            isLocked: false,
            lockedReason: '',
            expiryDate: expiryDate.toISOString().replace('T', ' ').slice(0, 19),
            status: 'ACTIVE',
            serverTimestamp: now.toISOString(),
          };
        }
        workspace.data.server_license = updatedLicense;
        workspace.markModified('data');
        await workspace.save({ session });
        await LicenseAuditModel.create([{
          tenantId,
          actorId: String(req.user._id),
          actorName: req.user.name,
          action: `license_${action}`,
          occurredAt: now,
          details: action === 'extend'
            ? { planId: license.planId, days: req.body.days, expiryDate: updatedLicense.expiryDate }
            : { planId: license.planId, previousStatus: license.status },
        }], { session });
      });
      return res.json({ license: updatedLicense });
    } catch (error) {
      if (error?.statusCode) return res.status(error.statusCode).json({ error: error.message });
      return next(error);
    } finally {
      await session.endSession();
    }
  });

  return router;
}

function parseLicenseDate(value) {
  if (typeof value !== 'string' || !value.trim()) return Number.NaN;
  const normalized = value.trim().replace(' ', 'T');
  const hasTimezone = /(?:Z|[+-]\d{2}:\d{2})$/i.test(normalized);
  return new Date(hasTimezone ? normalized : `${normalized}Z`).getTime();
}