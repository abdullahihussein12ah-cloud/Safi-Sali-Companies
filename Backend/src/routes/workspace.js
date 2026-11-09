import { Router } from 'express';
import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { EMPTY_USER_WORKSPACE_DATA, WorkspaceModel } from '../models/Workspace.js';
import { LicenseAuditModel } from '../models/LicenseAudit.js';
import { LicensePaymentRequestModel } from '../models/LicensePaymentRequest.js';
import { SubscriptionPlanModel } from '../models/SubscriptionPlan.js';
import { requireAdmin } from '../middleware/authenticate.js';
import {
  CONFIGURABLE_ROLES,
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSIONS,
  canReadWorkspaceKey,
  getRolePermissions,
  getWorkspacePermission,
  hasPermission,
  isValidRolePermissions,
} from '../permissions.js';
import { getLicenseLimits, TRIAL_DURATION_DAYS } from '../licenseLimits.js';
import { AccountExpenseModel } from '../models/AccountExpense.js';
import { FinancialAccountModel } from '../models/FinancialAccount.js';
import { FinancialTransactionModel } from '../models/FinancialTransaction.js';
import { UserModel } from '../models/User.js';
import { UserActivityModel } from '../models/UserActivity.js';
import { RecyclingBinAuditModel, RecyclingBinEntryModel } from '../models/RecyclingBin.js';

function isValidWorkspaceDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function getRegisteredBusinessTenantFilter(tenantId) {
  if (tenantId === 'business') {
    return { $or: [{ tenantId: 'business' }, { tenantId: { $exists: false } }] };
  }
  if (tenantId === 'platform') {
    return { $or: [{ tenantId: 'platform' }, { tenantId: { $exists: false } }] };
  }
  return { tenantId };
}

function mergeWorkspaceDataPreservingExisting(destination, source) {
  if (source === undefined) return destination;
  if (destination === undefined) return structuredClone(source);
  if (Array.isArray(destination) && Array.isArray(source)) {
    const merged = [...destination];
    const keys = new Set(destination.map((item) => {
      if (item && typeof item === 'object' && (item.id || item._id)) {
        return `id:${String(item.id || item._id)}`;
      }
      return `value:${JSON.stringify(item)}`;
    }));
    source.forEach((item) => {
      const key = item && typeof item === 'object' && (item.id || item._id)
        ? `id:${String(item.id || item._id)}`
        : `value:${JSON.stringify(item)}`;
      if (keys.has(key)) return;
      keys.add(key);
      merged.push(structuredClone(item));
    });
    return merged;
  }
  if (
    destination && typeof destination === 'object' && !Array.isArray(destination) &&
    source && typeof source === 'object' && !Array.isArray(source)
  ) {
    const merged = structuredClone(destination);
    Object.entries(source).forEach(([key, value]) => {
      merged[key] = mergeWorkspaceDataPreservingExisting(merged[key], value);
    });
    return merged;
  }
  return destination;
}

export const LICENSE_PLANS = {
  'plan-trial': { name: '365-Day Free Trial', price: 0, durationDays: TRIAL_DURATION_DAYS },
  'plan-basic': { name: 'Basic Retail Plan', price: 3, durationDays: 30 },
  'plan-professional': { name: 'Professional Business Plan', price: 5, durationDays: 30 },
  'plan-enterprise': { name: 'Enterprise Wholesaler Plan', price: 30, durationDays: 30 },
  'plan-annual': { name: 'Annual Enterprise Plan', price: 360, durationDays: 365 },
  'plan-lifetime': { name: 'Lifetime Enterprise Plan', price: 7000, durationDays: 0 },
};

const formatLicenseTimestamp = (value) =>
  value.toISOString().replace('T', ' ').slice(0, 19);

function parseLicenseTimestamp(value) {
  if (typeof value !== 'string' || !value.trim()) return Number.NaN;
  const normalized = value.trim().replace(' ', 'T');
  const hasTimezone = /(?:Z|[+-]\d{2}:\d{2})$/i.test(normalized);
  return new Date(hasTimezone ? normalized : `${normalized}Z`).getTime();
}

function createTrialLicense() {
  const activationDate = new Date();
  const expiryDate = new Date(activationDate.getTime() + TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000);
  return {
    isActive: true,
    isLocked: false,
    lockedReason: '',
    licenseKey: 'MQ-TRIAL-365D',
    planId: 'plan-trial',
    planName: '365-Day Free Trial',
    activationDate: formatLicenseTimestamp(activationDate),
    expiryDate: formatLicenseTimestamp(expiryDate),
    totalDays: TRIAL_DURATION_DAYS,
    currentDay: 1,
    daysRemaining: TRIAL_DURATION_DAYS,
    hoursRemaining: TRIAL_DURATION_DAYS * 24,
    secondsRemaining: TRIAL_DURATION_DAYS * 24 * 60 * 60,
    serverTimestamp: activationDate.toISOString(),
    status: 'ACTIVE',
    ussdPhone: '683723015',
    activeUssdCode: '',
  };
}

export async function getCurrentLicense(workspace) {
  const license = workspace?.data?.server_license;
  if (!license || typeof license !== 'object') return license;

  const now = new Date();
  let current = license;
  if (license.planId === 'plan-trial') {
    const activationTime = parseLicenseTimestamp(license.activationDate);
    if (Number.isFinite(activationTime)) {
      const expiry = new Date(activationTime + TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000);
      const expiryDate = formatLicenseTimestamp(expiry);
      const restorePreviouslyExpiredTrial = expiry.getTime() > now.getTime() &&
        license.status === 'EXPIRED' &&
        license.lockedReason === 'License expired';
      if (
        license.totalDays !== TRIAL_DURATION_DAYS ||
        license.licenseKey !== 'MQ-TRIAL-365D' ||
        license.planName !== '365-Day Free Trial' ||
        license.expiryDate !== expiryDate ||
        license.countdownExtendedAt ||
        restorePreviouslyExpiredTrial
      ) {
        current = {
          ...license,
          licenseKey: 'MQ-TRIAL-365D',
          planName: '365-Day Free Trial',
          totalDays: TRIAL_DURATION_DAYS,
          expiryDate,
          ...(restorePreviouslyExpiredTrial
            ? { isActive: true, isLocked: false, lockedReason: '', status: 'ACTIVE' }
            : {}),
          countdownExtendedAt: undefined,
        };
      }
    }
  }

  const expiryTime = parseLicenseTimestamp(current.expiryDate);
  const isExpired = current.planId !== 'plan-lifetime' &&
    (!Number.isFinite(expiryTime) || expiryTime <= Date.now());
  let expirationTransitioned = false;
  if (isExpired && (!current.isLocked || current.status !== 'EXPIRED' || current.isActive)) {
    current = {
      ...current,
      isActive: false,
      isLocked: true,
      lockedReason: 'License expired',
      status: 'EXPIRED',
    };
    expirationTransitioned = true;
  }

  if (current !== license) {
    const result = await WorkspaceModel.updateOne(
      {
        _id: workspace._id,
        ...(expirationTransitioned
          ? {
              'data.server_license.expiryDate': license.expiryDate,
              'data.server_license.status': license.status,
            }
          : {}),
      },
      { $set: { 'data.server_license': current } }
    );
    if (expirationTransitioned && result.modifiedCount === 1) {
      await LicenseAuditModel.create({
        tenantId: workspace.ownerId,
        actorId: 'system',
        actorName: 'License monitor',
        action: 'license_expired',
        occurredAt: now,
        details: { planId: current.planId, expiryDate: current.expiryDate },
      });
    }
  }
  const expiryAt = parseLicenseTimestamp(current.expiryDate);
  const secondsRemaining = current.planId === 'plan-lifetime' || !Number.isFinite(expiryAt)
    ? 0
    : Math.max(0, Math.ceil((expiryAt - now.getTime()) / 1000));
  const activationAt = parseLicenseTimestamp(current.activationDate);
  const elapsedDays = Number.isFinite(activationAt)
    ? Math.max(0, Math.floor((now.getTime() - activationAt) / 86400000))
    : 0;
  const planSettings = await SubscriptionPlanModel.findOne({ planId: current.planId })
    .select('userLimit productLimit')
    .lean();
  const planLimits = planSettings
    ? {
        users: Number.isSafeInteger(planSettings.userLimit)
          ? planSettings.userLimit
          : Number.POSITIVE_INFINITY,
        products: Number.isSafeInteger(planSettings.productLimit)
          ? planSettings.productLimit
          : Number.POSITIVE_INFINITY,
      }
    : getLicenseLimits(current.planId);
  return {
    ...current,
    userLimit: Number.isSafeInteger(planLimits.users) ? planLimits.users : null,
    productLimit: Number.isSafeInteger(planLimits.products) ? planLimits.products : null,
    currentDay: current.planId === 'plan-lifetime'
      ? 0
      : Math.min(Math.max(1, current.totalDays), elapsedDays + 1),
    daysRemaining: current.planId === 'plan-lifetime' ? 0 : Math.ceil(secondsRemaining / 86400),
    hoursRemaining: Math.floor(secondsRemaining / 3600),
    secondsRemaining,
    serverTimestamp: now.toISOString(),
  };
}

export async function monitorExpiredLicenses() {
  const trialMigrationCutoff = formatLicenseTimestamp(
    new Date(Date.now() - TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000)
  );
  const workspaces = await WorkspaceModel.find({
    scope: 'shared',
    $or: [
      {
        'data.server_license.planId': { $ne: 'plan-lifetime' },
        'data.server_license.status': { $ne: 'EXPIRED' },
      },
      {
        'data.server_license.planId': 'plan-trial',
        'data.server_license.status': 'EXPIRED',
        'data.server_license.activationDate': { $gte: trialMigrationCutoff },
      },
    ],
  }).select('ownerId data.server_license').lean();
  const now = Date.now();
  for (const workspace of workspaces) {
    const license = workspace.data?.server_license;
    const expiresAt = parseLicenseTimestamp(license?.expiryDate);
    if (!Number.isFinite(expiresAt) || expiresAt <= now) {
      await getCurrentLicense(workspace);
    }
  }
}

export function makeActivatedLicense(license, request, plan, now) {
  const currentExpiry = parseLicenseTimestamp(license?.expiryDate);
  const renewalStart = Number.isFinite(currentExpiry) && currentExpiry > now.getTime()
    ? new Date(currentExpiry)
    : now;
  const expiresAt = plan.durationDays === 0
    ? null
    : new Date(renewalStart.getTime() + plan.durationDays * 24 * 60 * 60 * 1000);
  const secondsRemaining = expiresAt
    ? Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / 1000))
    : 0;

  const previousPaymentHistory = Array.isArray(license?.paymentHistory)
    ? license.paymentHistory
    : license?.pendingPaymentRequest?.status === 'approved' &&
        license.pendingPaymentRequest.requestId &&
        Number.isFinite(license.pendingPaymentRequest.priceUSD)
      ? [{
          requestId: license.pendingPaymentRequest.requestId,
          planId: license.pendingPaymentRequest.planId,
          planName: license.pendingPaymentRequest.planName,
          priceUSD: license.pendingPaymentRequest.priceUSD,
          trxId: license.pendingPaymentRequest.trxId,
          submittedAt: license.pendingPaymentRequest.submittedAt,
          approvedAt: license.pendingPaymentRequest.approvedAt || '',
        }]
      : [];
  const paymentHistory = previousPaymentHistory.some((payment) => payment.requestId === request.requestId)
    ? previousPaymentHistory
    : [...previousPaymentHistory, {
        requestId: request.requestId,
        planId: request.planId,
        planName: request.planName,
        priceUSD: request.priceUSD,
        trxId: request.trxId,
        submittedAt: request.submittedAt,
        approvedAt: now.toISOString(),
      }];

  return {
    ...license,
    isActive: true,
    isLocked: false,
    lockedReason: '',
    licenseKey: `MQ-${request.planId.toUpperCase()}-${request.requestId.slice(0, 8).toUpperCase()}`,
    planId: request.planId,
    planName: `${plan.name} ($${plan.price})`,
    activationDate: formatLicenseTimestamp(renewalStart),
    expiryDate: expiresAt ? formatLicenseTimestamp(expiresAt) : '',
    totalDays: plan.durationDays,
    currentDay: plan.durationDays === 0 ? 0 : 1,
    daysRemaining: plan.durationDays === 0 ? 0 : Math.ceil(secondsRemaining / 86400),
    hoursRemaining: Math.floor(secondsRemaining / 3600),
    secondsRemaining,
    serverTimestamp: now.toISOString(),
    status: 'ACTIVE',
    ussdPhone: '683723015',
    activeUssdCode: `*712*683723015*${plan.price}#`,
    lastTrxId: request.trxId,
    usedTrxIds: [...new Set([...(license?.usedTrxIds || []), request.trxId])],
    paymentHistory,
    pendingPaymentRequest: {
      ...request,
      status: 'approved',
      approvedAt: now.toISOString(),
    },
  };
}

const SHARED_KEYS = new Set([
  'server_license',
]);
const PRIVATE_KEYS = new Set([
  'settings',
  'products',
  'customers',
  'suppliers',
  'categories',
  'category_records',
  'category_descriptions',
  'category_images',
  'brand_records',
  'sales',
  'purchases',
  'customer_ledger',
  'supplier_ledger',
  'stock_movements',
  'payroll',
  'attendance',
  'leave_records',
  'employee_settings',
]);

const RECYCLABLE_WORKSPACE_KEYS = {
  products: { module: 'Products', permission: 'inventory' },
  customers: { module: 'Customers', permission: 'customers' },
  suppliers: { module: 'Suppliers', permission: 'suppliers' },
  categories: { module: 'Categories', permission: 'inventory' },
  sales: { module: 'Sales & Invoices', permission: 'pos' },
  purchases: { module: 'Purchases', permission: 'purchases' },
  customer_ledger: { module: 'Customer Ledger', permission: 'customers' },
  supplier_ledger: { module: 'Supplier Ledger', permission: 'suppliers' },
  stock_movements: { module: 'Inventory', permission: 'inventory' },
  payroll: { module: 'Payroll', permission: 'manage_employees' },
  attendance: { module: 'Attendance', permission: 'manage_employees' },
  leave_records: { module: 'Leave Records', permission: 'manage_employees' },
};

const EMPLOYEE_RECYCLING_KEYS = new Set(['payroll', 'attendance', 'leave_records']);

function getRecyclingRecordId(record) {
  if (typeof record === 'string') return record;
  if (!record || typeof record !== 'object' || Array.isArray(record)) return '';
  return String(record.id || record._id || record.name || record.invoiceNumber || record.purchaseNumber || '');
}

function getRecyclingRecordName(record, recordId) {
  if (typeof record === 'string') return record;
  if (!record || typeof record !== 'object' || Array.isArray(record)) return recordId;
  return String(
    record.name ||
    record.productName ||
    record.invoiceNumber ||
    record.purchaseNumber ||
    record.userName ||
    record.customerName ||
    record.supplierName ||
    recordId
  );
}

function validateRecyclingRecord(record, recordId) {
  if (typeof record === 'string') return record.trim().length > 0 && record.length <= 500;
  if (!record || typeof record !== 'object' || Array.isArray(record)) return false;
  if (getRecyclingRecordId(record) !== recordId) return false;
  try {
    return Buffer.byteLength(JSON.stringify(record), 'utf8') <= 1024 * 1024;
  } catch {
    return false;
  }
}

function normalizeHeldOrderPayload(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const { items } = value;
  if (!Array.isArray(items) || items.length === 0 || items.length > 500) return null;
  const normalizedItems = [];
  for (const item of items) {
    if (
      !item || typeof item !== 'object' ||
      typeof item.productId !== 'string' || !item.productId.trim() ||
      typeof item.productName !== 'string' || !item.productName.trim() ||
      !Number.isFinite(item.quantity) || item.quantity <= 0 ||
      !Number.isFinite(item.unitPrice) || item.unitPrice < 0 ||
      !Number.isFinite(item.unitCost) || item.unitCost < 0 ||
      !Number.isFinite(item.discount ?? 0) || (item.discount ?? 0) < 0 ||
      !Number.isFinite(item.total) || item.total < 0
    ) {
      return null;
    }
    normalizedItems.push({
      productId: item.productId.trim(),
      productName: item.productName.trim(),
      sku: typeof item.sku === 'string' ? item.sku.slice(0, 100) : '',
      unit: typeof item.unit === 'string' ? item.unit.slice(0, 50) : '',
      quantity: item.quantity,
      unitCost: item.unitCost,
      unitPrice: item.unitPrice,
      discount: item.discount ?? 0,
      total: item.total,
    });
  }
  const amounts = ['subtotal', 'discount', 'tax', 'goodsInsurance', 'totalAmount'];
  if (amounts.some((key) => !Number.isFinite(value[key]) || value[key] < 0)) return null;
  if (value.discount > value.subtotal) return null;
  const recordedAmount = value.recordedAmount ?? 0;
  const saleType = value.saleType ?? 'cash';
  const paymentMethod = value.paymentMethod ?? 'cash';
  if (
    !Number.isFinite(recordedAmount) || recordedAmount < 0 ||
    !['cash', 'credit'].includes(saleType) ||
    !['cash', 'evc_plus', 'zaad', 'sahal', 'premier_wallet', 'card', 'deyn'].includes(paymentMethod)
  ) return null;
  return {
    items: normalizedItems,
    subtotal: value.subtotal,
    discount: value.discount,
    tax: value.tax,
    goodsInsurance: value.goodsInsurance,
    totalAmount: value.totalAmount,
    customerId: typeof value.customerId === 'string' ? value.customerId.slice(0, 100) : '',
    customerName: typeof value.customerName === 'string' ? value.customerName.slice(0, 200) : 'Walk-in Customer',
    customerPhone: typeof value.customerPhone === 'string' ? value.customerPhone.slice(0, 100) : '',
    tableName: typeof value.tableName === 'string' ? value.tableName.trim().slice(0, 100) : '',
    branchName: typeof value.branchName === 'string' ? value.branchName.trim().slice(0, 150) : '',
    saleType,
    paymentMethod,
    recordedAmount,
    taxEnabled: value.taxEnabled === true,
  };
}

function heldOrderAuditEvent(action, req, heldOrder, details = '') {
  return {
    id: randomUUID(),
    heldOrderId: heldOrder.id,
    reference: heldOrder.reference,
    action,
    actorId: String(req.user._id),
    actorName: req.user.name || '',
    actorRole: req.user.role,
    at: new Date().toISOString(),
    details,
  };
}

export function createWorkspaceRouter() {
  const router = Router();
  const getTenantId = (user) => user.tenantId || 'business';
  const requireBusinessAdministrator = (req, res, next) => {
    if (['admin', 'business_owner', 'business_admin'].includes(req.user?.role)) return next();
    return res.status(403).json({ error: 'Business administrator access required.' });
  };
  const employeeWorkspaceKeys = ['payroll', 'attendance', 'leave_records', 'employee_settings'];
  const getLegacyEmployeeData = async (tenantId) => {
    const tenantFilter = getRegisteredBusinessTenantFilter(tenantId);
    for (const role of ['business_owner', 'admin']) {
      const owner = await UserModel.findOne({ $and: [tenantFilter, { role }] }).sort({ createdAt: 1 }).lean();
      if (!owner) continue;
      const workspace = await WorkspaceModel.findOne({ ownerId: String(owner._id), scope: 'user' }).lean();
      if (workspace) {
        return Object.fromEntries(employeeWorkspaceKeys.map((key) => [
          key,
          key === 'employee_settings'
            ? workspace.data?.[key] || { annualLeaveAllowanceDays: 21 }
            : Array.isArray(workspace.data?.[key]) ? workspace.data[key] : [],
        ]));
      }
    }
    return Object.fromEntries(employeeWorkspaceKeys.map((key) => [
      key,
      key === 'employee_settings' ? { annualLeaveAllowanceDays: 21 } : [],
    ]));
  };

  router.use(async (req, res, next) => {
    if (
      req.path === '/license' ||
      req.path === '/license-plans' ||
      req.path === '/my-permissions' ||
      req.path === '/license/payment-requests'
    ) {
      return next();
    }

    try {
      const workspace = await WorkspaceModel.findOne({
        ownerId: getTenantId(req.user),
        scope: 'shared',
      }).lean();
      const license = await getCurrentLicense(workspace);
      if (!license && req.method === 'POST' && req.path === '/initialize') {
        return next();
      }
      if (!license || !license.isActive || license.isLocked) {
        if (req.method === 'GET' && req.path === '/') {
          return res.json({
            initialized: Boolean(workspace),
            shared: { server_license: license || null },
            private: {},
            locked: true,
          });
        }
        return res.status(423).json({ error: 'LICENSE_LOCKED' });
      }
      return next();
    } catch (error) {
      return next(error);
    }
  });

  router.get('/held-orders', async (req, res, next) => {
    try {
      if (!(await hasPermission(req.user, 'pos'))) {
        return res.status(403).json({ error: 'You do not have permission to access POS held orders.' });
      }
      const workspace = await WorkspaceModel.findOne({
        ownerId: getTenantId(req.user),
        scope: 'tenant',
      }).select('data.held_orders data.held_order_audit').lean();
      const orders = Array.isArray(workspace?.data?.held_orders) ? workspace.data.held_orders : [];
      const audit = Array.isArray(workspace?.data?.held_order_audit) ? workspace.data.held_order_audit : [];
      return res.json({
        orders: [...orders]
          .map((order) => order.processingBy === String(req.user._id)
            ? order
            : { ...order, processingToken: undefined })
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
        audit: [...audit].sort((left, right) => right.at.localeCompare(left.at)).slice(0, 250),
      });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/held-orders', async (req, res, next) => {
    try {
      if (!(await hasPermission(req.user, 'pos'))) {
        return res.status(403).json({ error: 'You do not have permission to hold POS orders.' });
      }
      const payload = normalizeHeldOrderPayload(req.body);
      if (!payload) return res.status(400).json({ error: 'Held order details are invalid.' });
      const now = new Date().toISOString();
      const id = randomUUID();
      const heldOrder = {
        ...payload,
        id,
        reference: `HLD-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${randomUUID().slice(0, 8).toUpperCase()}`,
        status: 'held',
        cashierId: String(req.user._id),
        cashierName: req.user.name || '',
        createdAt: now,
        updatedAt: now,
        updatedBy: String(req.user._id),
        version: 1,
      };
      const auditEvent = heldOrderAuditEvent('held', req, heldOrder);
      const tenantWorkspaceFilter = { ownerId: getTenantId(req.user), scope: 'tenant' };
      const appendOrderAndAudit = () => WorkspaceModel.updateOne(tenantWorkspaceFilter, {
        $push: {
          'data.held_orders': heldOrder,
          'data.held_order_audit': auditEvent,
        },
      });
      try {
        await WorkspaceModel.findOneAndUpdate(
          tenantWorkspaceFilter,
          {
            $setOnInsert: { ownerId: getTenantId(req.user), scope: 'tenant' },
            $push: {
              'data.held_orders': heldOrder,
              'data.held_order_audit': auditEvent,
            },
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
      } catch (error) {
        if (error?.code !== 11000) throw error;
        const result = await appendOrderAndAudit();
        if (result.matchedCount !== 1) throw error;
      }
      return res.status(201).json({ order: heldOrder });
    } catch (error) {
      return next(error);
    }
  });

  router.put('/held-orders/:id', async (req, res, next) => {
    try {
      if (!(await hasPermission(req.user, 'pos'))) {
        return res.status(403).json({ error: 'You do not have permission to edit POS held orders.' });
      }
      const payload = normalizeHeldOrderPayload(req.body);
      const expectedVersion = req.body?.version;
      if (!payload || !Number.isInteger(expectedVersion) || expectedVersion < 1) {
        return res.status(400).json({ error: 'Held order details are invalid.' });
      }
      const currentWorkspace = await WorkspaceModel.findOne({
        ownerId: getTenantId(req.user),
        scope: 'tenant',
        'data.held_orders': { $elemMatch: { id: req.params.id, status: 'held', version: expectedVersion } },
      }).select('data.held_orders').lean();
      const currentOrder = currentWorkspace?.data?.held_orders?.find(
        (order) => order.id === req.params.id && order.status === 'held' && order.version === expectedVersion
      );
      if (!currentOrder) return res.status(409).json({ error: 'This held order was changed or is no longer available.' });
      const now = new Date().toISOString();
      const updatedOrder = {
        ...payload,
        id: req.params.id,
        status: 'held',
        cashierId: currentOrder.cashierId,
        cashierName: currentOrder.cashierName,
        createdAt: currentOrder.createdAt,
        updatedAt: now,
        updatedBy: String(req.user._id),
        version: expectedVersion + 1,
        reference: currentOrder.reference,
      };
      const auditEvent = heldOrderAuditEvent('updated', req, updatedOrder);
      const workspace = await WorkspaceModel.findOneAndUpdate(
        {
          ownerId: getTenantId(req.user),
          scope: 'tenant',
          'data.held_orders': { $elemMatch: { id: req.params.id, status: 'held', version: expectedVersion } },
        },
        {
          $set: { 'data.held_orders.$': updatedOrder },
          $push: { 'data.held_order_audit': auditEvent },
        },
        { new: true }
      ).select('_id').lean();
      if (!workspace) return res.status(409).json({ error: 'This held order was changed or is no longer available.' });
      return res.json({ order: updatedOrder });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/held-orders/:id/claim', async (req, res, next) => {
    try {
      if (!(await hasPermission(req.user, 'pos'))) {
        return res.status(403).json({ error: 'You do not have permission to complete POS held orders.' });
      }
      const workspaceFilter = { ownerId: getTenantId(req.user), scope: 'tenant' };
      const currentWorkspace = await WorkspaceModel.findOne({
        ...workspaceFilter,
        'data.held_orders.id': req.params.id,
      }).select('data.held_orders').lean();
      const currentOrder = currentWorkspace?.data?.held_orders?.find((order) => order.id === req.params.id);
      if (!currentOrder || !['held', 'processing'].includes(currentOrder.status)) {
        return res.status(409).json({ error: 'This held order is no longer available to complete.' });
      }
      const userId = String(req.user._id);
      if (currentOrder.status === 'processing') {
        if (currentOrder.processingBy === userId && currentOrder.processingToken) {
          return res.json({ order: currentOrder });
        }
        const processingAt = Date.parse(currentOrder.processingAt || '');
        if (!Number.isFinite(processingAt) || processingAt > Date.now() - 5 * 60 * 1000) {
          return res.status(409).json({ error: 'Another cashier is already processing this held order.' });
        }
      }
      const now = new Date().toISOString();
      const processingOrder = {
        ...currentOrder,
        status: 'processing',
        processingBy: userId,
        processingAt: now,
        processingToken: randomUUID(),
        updatedAt: now,
        version: (currentOrder.version || 1) + 1,
      };
      const auditEvent = heldOrderAuditEvent('processing', req, processingOrder);
      const expectedState = currentOrder.status === 'held'
        ? { status: 'held', version: currentOrder.version || 1 }
        : { status: 'processing', version: currentOrder.version || 1, processingToken: currentOrder.processingToken };
      const updated = await WorkspaceModel.findOneAndUpdate({
        ...workspaceFilter,
        data: { $exists: true },
        'data.held_orders': { $elemMatch: { id: req.params.id, ...expectedState } },
      }, {
        $set: { 'data.held_orders.$': processingOrder },
        $push: { 'data.held_order_audit': auditEvent },
      }, { new: true }).select('_id').lean();
      if (!updated) return res.status(409).json({ error: 'This held order was claimed by another cashier.' });
      return res.json({ order: processingOrder });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/held-orders/:id/release', async (req, res, next) => {
    try {
      if (!(await hasPermission(req.user, 'pos'))) {
        return res.status(403).json({ error: 'You do not have permission to release POS held orders.' });
      }
      const processingToken = typeof req.body?.processingToken === 'string' ? req.body.processingToken : '';
      if (!processingToken) return res.status(400).json({ error: 'Held order processing token is required.' });
      const workspaceFilter = { ownerId: getTenantId(req.user), scope: 'tenant' };
      const workspace = await WorkspaceModel.findOne({
        ...workspaceFilter,
        'data.held_orders': {
          $elemMatch: {
            id: req.params.id,
            status: 'processing',
            processingBy: String(req.user._id),
            processingToken,
          },
        },
      }).select('data.held_orders').lean();
      const currentOrder = workspace?.data?.held_orders?.find(
        (order) => order.id === req.params.id && order.status === 'processing' &&
          order.processingBy === String(req.user._id) && order.processingToken === processingToken
      );
      if (!currentOrder) return res.status(409).json({ error: 'This held order processing claim is no longer available.' });
      const {
        processingBy: _processingBy,
        processingAt: _processingAt,
        processingToken: _processingToken,
        ...heldOrder
      } = currentOrder;
      const releasedOrder = {
        ...heldOrder,
        status: 'held',
        updatedAt: new Date().toISOString(),
        version: (currentOrder.version || 1) + 1,
      };
      const auditEvent = heldOrderAuditEvent('released', req, releasedOrder);
      const updated = await WorkspaceModel.findOneAndUpdate({
        ...workspaceFilter,
        'data.held_orders': {
          $elemMatch: {
            id: req.params.id,
            status: 'processing',
            version: currentOrder.version || 1,
            processingToken,
          },
        },
      }, {
        $set: { 'data.held_orders.$': releasedOrder },
        $push: { 'data.held_order_audit': auditEvent },
      }, { new: true }).select('_id').lean();
      if (!updated) return res.status(409).json({ error: 'This held order changed before it could be released.' });
      return res.json({ order: releasedOrder });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/held-orders/:id/complete', async (req, res, next) => {
    try {
      if (!(await hasPermission(req.user, 'pos'))) {
        return res.status(403).json({ error: 'You do not have permission to complete POS held orders.' });
      }
      const now = new Date().toISOString();
      const workspace = await WorkspaceModel.findOne({
        ownerId: getTenantId(req.user),
        scope: 'tenant',
        'data.held_orders.id': req.params.id,
      }).lean();
      const heldOrder = workspace?.data?.held_orders?.find(
        (order) => order.id === req.params.id
      );
      if (heldOrder?.status === 'completed') return res.json({ order: heldOrder });
      const processingToken = typeof req.body?.processingToken === 'string' ? req.body.processingToken : '';
      if (
        !heldOrder || heldOrder.status !== 'processing' ||
        heldOrder.processingBy !== String(req.user._id) ||
        !processingToken || heldOrder.processingToken !== processingToken
      ) {
        return res.status(409).json({ error: 'This held order was already completed, cancelled, or changed.' });
      }
      const {
        processingBy: _processingBy,
        processingAt: _processingAt,
        processingToken: _processingToken,
        ...orderWithoutProcessingClaim
      } = heldOrder;
      const completedOrder = {
        ...orderWithoutProcessingClaim,
        status: 'completed',
        completedAt: now,
        completedBy: String(req.user._id),
        completedByName: req.user.name || '',
        updatedAt: now,
        version: (heldOrder.version || 1) + 1,
      };
      const auditEvent = heldOrderAuditEvent('completed', req, completedOrder);
      const updated = await WorkspaceModel.findOneAndUpdate(
        {
          ownerId: getTenantId(req.user),
          scope: 'tenant',
          'data.held_orders': {
            $elemMatch: {
              id: req.params.id,
              status: 'processing',
              version: heldOrder.version || 1,
              processingToken,
            },
          },
        },
        {
          $set: { 'data.held_orders.$': completedOrder },
          $push: { 'data.held_order_audit': auditEvent },
        },
        { new: true }
      ).select('_id').lean();
      if (!updated) return res.status(409).json({ error: 'This held order was already completed, cancelled, or changed.' });
      return res.json({ order: completedOrder });
    } catch (error) {
      return next(error);
    }
  });

  router.delete('/held-orders/:id', async (req, res, next) => {
    try {
      if (!(await hasPermission(req.user, 'pos'))) {
        return res.status(403).json({ error: 'You do not have permission to cancel POS held orders.' });
      }
      const workspace = await WorkspaceModel.findOne({
        ownerId: getTenantId(req.user),
        scope: 'tenant',
        'data.held_orders': { $elemMatch: { id: req.params.id, status: 'held' } },
      }).lean();
      const heldOrder = workspace?.data?.held_orders?.find(
        (order) => order.id === req.params.id && order.status === 'held'
      );
      if (!heldOrder) return res.status(409).json({ error: 'This held order was already completed, cancelled, or changed.' });
      const isOrderManager = ['admin', 'business_owner', 'business_admin', 'branch_manager', 'manager'].includes(req.user.role);
      if (!isOrderManager && heldOrder.cashierId !== String(req.user._id)) {
        return res.status(403).json({ error: 'Only the cashier who held this order or an authorized manager can cancel it.' });
      }
      const now = new Date().toISOString();
      const cancelledOrder = {
        ...heldOrder,
        status: 'cancelled',
        cancelledAt: now,
        cancelledBy: String(req.user._id),
        cancelledByName: req.user.name || '',
        updatedAt: now,
        version: (heldOrder.version || 1) + 1,
      };
      const auditEvent = heldOrderAuditEvent('cancelled', req, cancelledOrder, typeof req.body?.reason === 'string' ? req.body.reason.slice(0, 250) : '');
      const updated = await WorkspaceModel.findOneAndUpdate(
        {
          ownerId: getTenantId(req.user),
          scope: 'tenant',
          'data.held_orders': { $elemMatch: { id: req.params.id, status: 'held', version: heldOrder.version || 1 } },
        },
        {
          $set: { 'data.held_orders.$': cancelledOrder },
          $push: { 'data.held_order_audit': auditEvent },
        },
        { new: true }
      ).select('_id').lean();
      if (!updated) return res.status(409).json({ error: 'This held order was already completed, cancelled, or changed.' });
      return res.json({ order: cancelledOrder });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/my-permissions', async (req, res, next) => {
    try {
      return res.json({ permissions: await getRolePermissions(req.user) });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/team-activity', async (req, res, next) => {
    try {
      if (!['admin', 'business_owner', 'business_admin'].includes(req.user.role)) {
        return res.status(403).json({ error: 'Business administrator access is required to review team sales.' });
      }
      if (!(await hasPermission(req.user, 'reports'))) {
        return res.status(403).json({ error: 'You do not have permission to review team sales.' });
      }
      const page = Number(req.query.page ?? 1);
      const pageSize = 50;
      if (!Number.isInteger(page) || page < 1) {
        return res.status(400).json({ error: 'Page must be a positive integer.' });
      }

      const tenantId = getTenantId(req.user);
      const tenantFilter = getRegisteredBusinessTenantFilter(tenantId);
      const users = await UserModel.find(tenantFilter)
        .select('_id name role')
        .sort({ name: 1 })
        .lean();
      const workspaces = users.length
        ? await WorkspaceModel.find({
            ownerId: { $in: users.map((user) => String(user._id)) },
            scope: 'user',
          }).select('ownerId data.sales').lean()
        : [];
      const salesByOwner = new Map(workspaces.map((workspace) => [workspace.ownerId, workspace.data?.sales]));
      const sales = users.flatMap((user) => {
        const userSales = salesByOwner.get(String(user._id));
        if (!Array.isArray(userSales)) return [];
        return userSales
          .filter((sale) => sale && typeof sale === 'object')
          .map((sale) => ({
            id: typeof sale.id === 'string' ? sale.id : '',
            invoiceNumber: typeof sale.invoiceNumber === 'string' ? sale.invoiceNumber : '',
            date: typeof sale.date === 'string' ? sale.date : '',
            cashierId: typeof sale.cashierId === 'string' ? sale.cashierId : String(user._id),
            cashierName: typeof sale.cashierName === 'string' && sale.cashierName ? sale.cashierName : user.name,
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
          }));
      }).sort((left, right) => right.date.localeCompare(left.date));
      const summaries = new Map();
      sales.forEach((sale) => {
        if (sale.paymentStatus === 'refunded') return;
        const key = sale.cashierId || sale.cashierName;
        const summary = summaries.get(key) || {
          id: key,
          name: sale.cashierName,
          role: sale.cashierRole,
          salesCount: 0,
          totals: new Map(),
        };
        summary.salesCount += 1;
        summary.totals.set(
          sale.currency,
          (summary.totals.get(sale.currency) || 0) + sale.totalAmount
        );
        summaries.set(key, summary);
      });
      const start = (page - 1) * pageSize;

      return res.json({
        sales: sales.slice(start, start + pageSize),
        staff: [...summaries.values()].map((summary) => ({
          ...summary,
          totals: [...summary.totals.entries()].map(([currency, amount]) => ({ currency, amount })),
        })),
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

  router.get('/team-overview', requireBusinessAdministrator, async (req, res, next) => {
    try {
      if (!(await hasPermission(req.user, 'reports'))) {
        return res.status(403).json({ error: 'You do not have permission to review team operations.' });
      }

      const tenantId = getTenantId(req.user);
      const tenantFilter = tenantId === 'business'
        ? { $or: [{ tenantId: 'business' }, { tenantId: { $exists: false } }] }
        : { tenantId };
      const userFilter = req.user.role === 'business_admin'
        ? {
            $and: [
              tenantFilter,
              {
                $or: [
                  { role: { $nin: ['admin', 'business_owner', 'super_admin'] } },
                  { _id: req.user.id },
                ],
              },
            ],
          }
        : { $and: [tenantFilter, { role: { $ne: 'super_admin' } }] };
      const users = await UserModel.find(userFilter)
        .select('_id name role active createdAt')
        .sort({ role: 1, name: 1 })
        .lean();
      const userIds = users.map((user) => String(user._id));
      const [workspaces, employeeWorkspace] = await Promise.all([
        userIds.length
          ? WorkspaceModel.find({ ownerId: { $in: userIds }, scope: 'user' })
            .select('ownerId data.products data.customers data.suppliers data.sales data.purchases data.stock_movements')
            .lean()
          : [],
        WorkspaceModel.findOne({ ownerId: tenantId, scope: 'tenant' })
          .select('data.payroll data.attendance data.leave_records')
          .lean(),
      ]);
      const workspaceByUser = new Map(workspaces.map((workspace) => [workspace.ownerId, workspace.data || {}]));
      const employeeData = employeeWorkspace?.data || {};
      const arrayLength = (value) => Array.isArray(value) ? value.length : 0;
      const sumByCurrency = (records) => {
        const totals = new Map();
        (Array.isArray(records) ? records : []).forEach((record) => {
          if (!Number.isFinite(record?.totalAmount) && !Number.isFinite(record?.totalCost)) return;
          const amount = Number.isFinite(record.totalAmount) ? record.totalAmount : record.totalCost;
          const currency = typeof record.currency === 'string' ? record.currency : 'USD';
          totals.set(currency, (totals.get(currency) || 0) + amount);
        });
        return [...totals.entries()].map(([currency, amount]) => ({ currency, amount }));
      };
      const recordsForUser = (key, userId) => Array.isArray(employeeData[key])
        ? employeeData[key].filter((record) => record?.userId === userId)
        : [];
      const staff = users.map((user) => {
        const data = workspaceByUser.get(String(user._id)) || {};
        const sales = Array.isArray(data.sales) ? data.sales : [];
        const purchases = Array.isArray(data.purchases) ? data.purchases : [];
        const customers = Array.isArray(data.customers) ? data.customers : [];
        const suppliers = Array.isArray(data.suppliers) ? data.suppliers : [];
        const userId = String(user._id);
        return {
          id: userId,
          name: user.name,
          role: user.role,
          active: user.active,
          createdAt: user.createdAt?.toISOString?.() || '',
          productsCount: arrayLength(data.products),
          customersCount: customers.length,
          suppliersCount: suppliers.length,
          salesCount: sales.length,
          salesTotals: sumByCurrency(sales),
          purchasesCount: purchases.length,
          purchasesTotals: sumByCurrency(purchases),
          stockMovementsCount: arrayLength(data.stock_movements),
          payrollRecordsCount: recordsForUser('payroll', userId).length,
          attendanceRecordsCount: recordsForUser('attendance', userId).length,
          leaveRecordsCount: recordsForUser('leave_records', userId).length,
        };
      });
      const roleCounts = staff.reduce((counts, member) => {
        counts[member.role] = (counts[member.role] || 0) + 1;
        return counts;
      }, {});
      return res.json({ staff, roleCounts });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/team-users/:userId/data', async (req, res, next) => {
    try {
      const isPlatformAdmin = req.user.role === 'admin' && getTenantId(req.user) === 'business';
      if (!isPlatformAdmin && !['business_owner', 'business_admin'].includes(req.user.role)) {
        return res.status(403).json({ error: 'Business administrator access is required to review staff workspaces.' });
      }
      const userId = req.params.userId;
      if (!/^[a-f\d]{24}$/i.test(userId)) {
        return res.status(400).json({ error: 'User ID is invalid.' });
      }
      const tenantId = getTenantId(req.user);
      const userFilter = isPlatformAdmin
        ? { _id: userId, role: { $nin: ['admin', 'super_admin'] } }
        : req.user.role === 'business_admin'
          ? {
              $and: [
                { _id: userId, tenantId },
                {
                  $or: [
                    { role: { $nin: ['admin', 'business_owner', 'business_admin', 'super_admin'] } },
                    { _id: req.user.id },
                  ],
                },
              ],
            }
          : {
              $and: [
                { _id: userId, tenantId },
                { role: { $nin: ['admin', 'business_owner', 'super_admin'] } },
              ],
            };
      const user = await UserModel.findOne(userFilter)
        .select('_id name email phone role active createdAt').lean();
      if (!user) return res.status(404).json({ error: 'User was not found in this business.' });

      const [workspace, employeeWorkspace] = await Promise.all([
        WorkspaceModel.findOne({ ownerId: userId, scope: 'user' }).lean(),
        WorkspaceModel.findOne({ ownerId: tenantId, scope: 'tenant' })
          .select('data.payroll data.attendance data.leave_records')
          .lean(),
      ]);
      const data = { ...EMPTY_USER_WORKSPACE_DATA, ...(workspace?.data || {}) };
      const employeeData = employeeWorkspace?.data || {};
      const userEmployeeRecords = Object.fromEntries(
        ['payroll', 'attendance', 'leave_records'].map((key) => [
          key,
          Array.isArray(employeeData[key])
            ? employeeData[key].filter((record) => record?.userId === userId)
            : [],
        ])
      );
      return res.json({
        user: {
          id: String(user._id),
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
          active: user.active,
          createdAt: user.createdAt?.toISOString?.() || '',
        },
        workspace: data,
        employeeRecords: userEmployeeRecords,
      });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/registered-businesses', async (req, res, next) => {
    try {
      if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Platform owner access is required to list registered businesses.' });
      }
      const owners = await UserModel.find({
        role: 'business_owner',
        tenantId: { $ne: 'platform' },
        deletedAt: null,
      }).select('_id tenantId name email phone createdAt active').sort({ createdAt: -1 }).lean();
      const tenantIds = [...new Set(owners.map((owner) => owner.tenantId || 'business'))];
      const ownerIds = owners.map((owner) => String(owner._id));
      const tenantFilters = tenantIds.map((tenantId) => tenantId === 'business'
        ? { $or: [{ tenantId: 'business' }, { tenantId: { $exists: false } }] }
        : { tenantId });
      const [workspaces, teamMembers, registeredAccounts] = await Promise.all([
        ownerIds.length
          ? WorkspaceModel.find({ ownerId: { $in: ownerIds }, scope: 'user' })
            .select('ownerId data.settings.businessName')
            .lean()
          : [],
        tenantIds.length
          ? UserModel.find({
              $or: tenantFilters,
              role: { $nin: ['admin', 'business_owner', 'super_admin'] },
              deletedAt: null,
            }).select('tenantId').lean()
          : [],
        UserModel.find({
          deletedAt: null,
        }).select('_id tenantId name email phone role dateOfBirth address jobTitle monthlySalary employeeDetails createdAt active').sort({ createdAt: -1, _id: 1 }).lean(),
      ]);
      const settingsByOwner = new Map(workspaces.map((workspace) => [
        workspace.ownerId,
        workspace.data?.settings?.businessName,
      ]));
      const ownerByTenant = new Map(owners.map((owner) => [owner.tenantId || 'business', owner]));
      const staffCounts = teamMembers.reduce((counts, member) => {
        const id = member.tenantId || 'business';
        counts[id] = (counts[id] || 0) + 1;
        return counts;
      }, {});
      const businessSummaries = registeredAccounts.map((account) => {
        const tenantId = account.tenantId ||
          (account.role === 'super_admin' ? 'platform' : 'business');
        const owner = ownerByTenant.get(tenantId);
        const configuredBusinessName = owner && settingsByOwner.get(String(owner._id));
        const businessName = account.role === 'super_admin'
          ? 'Super Admin'
          : account.role === 'admin'
            ? 'Admin Full Access Owner'
            : typeof configuredBusinessName === 'string' && configuredBusinessName.trim()
              ? configuredBusinessName.trim()
              : owner?.name || account.name;
        return {
          userId: String(account._id),
          tenantId,
          businessName,
          name: account.name || account.email || 'Unnamed account',
          email: account.email || '',
          phone: account.phone || '',
          dateOfBirth: account.dateOfBirth || '',
          address: account.address || '',
          jobTitle: account.jobTitle || '',
          monthlySalary: account.monthlySalary || 0,
          employeeDetails: account.employeeDetails || {},
          role: account.role,
          registeredAt: account.createdAt?.toISOString?.() || '',
          active: Boolean(account.active),
          staffCount: staffCounts[tenantId] || 0,
        };
      });
      businessSummaries.sort((left, right) => {
        const roleOrder = {
          admin: 0,
          super_admin: 1,
          business_owner: 2,
          business_admin: 3,
          manager: 4,
          branch_manager: 4,
          accountant: 5,
          cashier: 6,
          inventory_manager: 7,
          hr_manager: 8,
          employee: 9,
        };
        const leftOrder = roleOrder[left.role] ?? 2;
        const rightOrder = roleOrder[right.role] ?? 2;
        return leftOrder - rightOrder ||
          left.name.localeCompare(right.name) ||
          right.registeredAt.localeCompare(left.registeredAt);
      });
      return res.json({
        businesses: businessSummaries,
      });
    } catch (error) {
      return next(error);
    }
  });

  router.patch('/registered-businesses/:tenantId/users/:userId', async (req, res, next) => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Platform owner access is required to edit registered accounts.' });
    }
    const { tenantId, userId } = req.params;
    if (
      (tenantId !== 'business' && tenantId !== 'platform' && !/^[a-f\d]{24}$/i.test(tenantId)) ||
      !/^[a-f\d]{24}$/i.test(userId)
    ) {
      return res.status(400).json({ error: 'Business or user ID is invalid.' });
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
    const tenantFilter = tenantId === 'business'
      ? { $or: [{ tenantId: 'business' }, { tenantId: { $exists: false } }] }
      : { tenantId };
    let session;
    try {
      session = await mongoose.startSession();
      let updatedUser;
      await session.withTransaction(async () => {
        const user = await UserModel.findOne({
          $and: [{ _id: userId }, tenantFilter, { deletedAt: null }],
        }).session(session);
        if (!user) throw Object.assign(new Error('Registered account was not found.'), { statusCode: 404 });
        if (
          String(user._id) === String(req.user._id) &&
          (role !== user.role || !active)
        ) {
          throw Object.assign(new Error('You cannot change your own role or deactivate your account.'), {
            statusCode: 403,
          });
        }
        if (role === 'super_admin' && user.role !== 'super_admin') {
          throw Object.assign(new Error('Platform Administrator role cannot be assigned to another account.'), {
            statusCode: 403,
          });
        }
        if (user.role === 'super_admin' && user.active && (role !== user.role || !active)) {
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
      return res.json({
        user: {
          id: String(updatedUser._id),
          name: updatedUser.name,
          email: updatedUser.email,
          phone: updatedUser.phone || '',
          role: updatedUser.role,
          active: updatedUser.active,
        },
      });
    } catch (error) {
      if (error?.code === 11000) return res.status(409).json({ error: 'An account with this email already exists.' });
      if (error?.statusCode) return res.status(error.statusCode).json({ error: error.message });
      return next(error);
    } finally {
      if (session) await session.endSession();
    }
  });

  router.delete('/registered-businesses/:tenantId/users/:userId', async (req, res, next) => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Platform owner access is required to delete registered accounts.' });
    }
    const { tenantId, userId } = req.params;
    if (
      (tenantId !== 'business' && tenantId !== 'platform' && !/^[a-f\d]{24}$/i.test(tenantId)) ||
      !/^[a-f\d]{24}$/i.test(userId)
    ) {
      return res.status(400).json({ error: 'Business or user ID is invalid.' });
    }
    if (String(userId) === String(req.user._id)) {
      return res.status(403).json({ error: 'You cannot move your own account to the Recycling Bin.' });
    }
    const tenantFilter = tenantId === 'business'
      ? { $or: [{ tenantId: 'business' }, { tenantId: { $exists: false } }] }
      : { tenantId };
    let session;
    try {
      session = await mongoose.startSession();
      let outcome = 'deleted';
      await session.withTransaction(async () => {
        const user = await UserModel.findOne({
          $and: [{ _id: userId }, tenantFilter, { deletedAt: null }],
        }).session(session);
        if (!user) {
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
      if (outcome === 'not-found') return res.status(404).json({ error: 'Registered account was not found.' });
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

  router.get('/registered-businesses/:tenantId/data', async (req, res, next) => {
    try {
      if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Platform owner access is required to review business data.' });
      }
      const tenantId = req.params.tenantId;
      if (tenantId !== 'business' && !/^[a-f\d]{24}$/i.test(tenantId)) {
        return res.status(400).json({ error: 'Business ID is invalid.' });
      }
      const tenantFilter = tenantId === 'business'
        ? { $or: [{ tenantId: 'business' }, { tenantId: { $exists: false } }] }
        : { tenantId };
      const owner = await UserModel.findOne({ $and: [tenantFilter, { role: 'business_owner' }] })
        .select('_id name email phone role active createdAt').lean();
      if (!owner) return res.status(404).json({ error: 'Registered business was not found.' });

      const users = await UserModel.find({
        $and: [tenantFilter, { role: { $nin: ['admin', 'super_admin'] } }],
      })
        .select('_id name email phone role active createdAt')
        .sort({ role: 1, name: 1 })
        .lean();
      const [workspaces, tenantWorkspace, sharedWorkspace, financialAccounts, financialTransactions, accountExpenses] = await Promise.all([
        WorkspaceModel.find({
          ownerId: { $in: users.map((user) => String(user._id)) },
          scope: 'user',
        }).select('ownerId data').lean(),
        WorkspaceModel.findOne({ ownerId: tenantId, scope: 'tenant' }).select('data').lean(),
        WorkspaceModel.findOne({ ownerId: tenantId, scope: 'shared' }).select('data').lean(),
        FinancialAccountModel.find({ tenantId }).sort({ createdAt: 1 }).lean(),
        FinancialTransactionModel.find({ tenantId }).sort({ date: -1 }).lean(),
        AccountExpenseModel.find({ tenantId }).sort({ date: -1 }).lean(),
      ]);
      const workspaceByUser = new Map(workspaces.map((workspace) => [workspace.ownerId, workspace.data || {}]));
      const tenantData = tenantWorkspace?.data || {};
      const members = users.map((user) => {
        const userId = String(user._id);
        const userWorkspace = {
          ...EMPTY_USER_WORKSPACE_DATA,
          ...(workspaceByUser.get(userId) || {}),
        };
        const employeeRecords = Object.fromEntries(
          ['payroll', 'attendance', 'leave_records'].map((key) => [
            key,
            Array.isArray(tenantData[key])
              ? tenantData[key].filter((record) => record?.userId === userId)
              : [],
          ])
        );
        return {
          user: {
            id: userId,
            name: user.name,
            email: user.email,
            phone: user.phone,
            role: user.role,
            active: user.active,
            createdAt: user.createdAt?.toISOString?.() || '',
          },
          workspace: userWorkspace,
          employeeRecords,
        };
      });
      const ownerWorkspace = workspaceByUser.get(String(owner._id)) || {};
      const businessName = typeof ownerWorkspace.settings?.businessName === 'string' &&
        ownerWorkspace.settings.businessName.trim()
        ? ownerWorkspace.settings.businessName.trim()
        : owner.name;

      return res.json({
        business: {
          tenantId,
          businessName,
          registeredAt: owner.createdAt?.toISOString?.() || '',
          active: owner.active,
          staffCount: Math.max(0, users.length - 1),
        },
        members,
        tenantWorkspace: tenantData,
        sharedWorkspace: sharedWorkspace?.data || {},
        accounting: {
          financialAccounts,
          financialTransactions,
          accountExpenses,
        },
      });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/registered-businesses/:tenantId/users/:userId/transfer-to-owner', async (req, res, next) => {
    try {
      if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Platform owner access is required to transfer business data.' });
      }
      const { tenantId, userId } = req.params;
      if (
        (tenantId !== 'business' && !/^[a-f\d]{24}$/i.test(tenantId)) ||
        !/^[a-f\d]{24}$/i.test(userId)
      ) {
        return res.status(400).json({ error: 'Business or user ID is invalid.' });
      }
      const tenantFilter = tenantId === 'business'
        ? { $or: [{ tenantId: 'business' }, { tenantId: { $exists: false } }] }
        : { tenantId };
      const sourceUser = await UserModel.findOne({
        $and: [{ _id: userId }, tenantFilter, { role: 'business_admin' }],
      }).select('_id name').lean();
      if (!sourceUser) {
        return res.status(404).json({ error: 'Business Admin account was not found in this business.' });
      }

      const targetTenantId = getTenantId(req.user);
      const [sourceWorkspace, destinationWorkspace, sourceTenantWorkspace, destinationTenantWorkspace] = await Promise.all([
        WorkspaceModel.findOne({ ownerId: userId, scope: 'user' }).lean(),
        WorkspaceModel.findOne({ ownerId: req.user.id, scope: 'user' }).lean(),
        WorkspaceModel.findOne({ ownerId: tenantId, scope: 'tenant' }).lean(),
        WorkspaceModel.findOne({ ownerId: targetTenantId, scope: 'tenant' }).lean(),
      ]);
      const sourceData = sourceWorkspace?.data || {};
      const sourceTenantData = sourceTenantWorkspace?.data || {};
      const destinationData = destinationWorkspace?.data || structuredClone(EMPTY_USER_WORKSPACE_DATA);
      const destinationTenantData = destinationTenantWorkspace?.data || {};
      const employeeKeys = ['payroll', 'attendance', 'leave_records'];
      const privateDataToTransfer = { ...sourceData };
      employeeKeys.forEach((key) => delete privateDataToTransfer[key]);
      delete privateDataToTransfer.employee_settings;

      const mergedDestinationData = mergeWorkspaceDataPreservingExisting(destinationData, privateDataToTransfer);
      const transferredRecordCounts = {};
      const employeeRecordsToTransfer = {};
      employeeKeys.forEach((key) => {
        const privateRecords = Array.isArray(sourceData[key]) ? sourceData[key] : [];
        const tenantRecords = Array.isArray(sourceTenantData[key])
          ? sourceTenantData[key].filter((record) => String(record?.userId) === userId)
          : [];
        const records = mergeWorkspaceDataPreservingExisting(privateRecords, tenantRecords);
        employeeRecordsToTransfer[key] = records.map((record) =>
          record && typeof record === 'object'
            ? { ...record, userId: String(req.user.id), userName: req.user.name }
            : record
        );
        transferredRecordCounts[key] = records.length;
      });

      const employeeSettings = sourceData.employee_settings;
      const mergedDestinationTenantData = mergeWorkspaceDataPreservingExisting(
        destinationTenantData,
        {
          ...employeeRecordsToTransfer,
          ...(employeeSettings !== undefined ? { employee_settings: employeeSettings } : {}),
        }
      );

      await WorkspaceModel.updateOne(
        { ownerId: req.user.id, scope: 'user' },
        { $set: { data: mergedDestinationData } },
        { upsert: true }
      );
      await WorkspaceModel.updateOne(
        { ownerId: targetTenantId, scope: 'tenant' },
        { $set: { data: mergedDestinationTenantData } },
        { upsert: true }
      );

      await WorkspaceModel.updateOne(
        { ownerId: userId, scope: 'user' },
        { $set: { data: structuredClone(EMPTY_USER_WORKSPACE_DATA) } }
      );
      const latestSourceTenantWorkspace = await WorkspaceModel.findOne({
        ownerId: tenantId,
        scope: 'tenant',
      }).lean();
      if (latestSourceTenantWorkspace) {
        const clearedSourceTenantData = { ...(latestSourceTenantWorkspace.data || {}) };
        employeeKeys.forEach((key) => {
          if (Array.isArray(clearedSourceTenantData[key])) {
            clearedSourceTenantData[key] = clearedSourceTenantData[key]
              .filter((record) => String(record?.userId) !== userId);
          }
        });
        await WorkspaceModel.updateOne(
          { _id: latestSourceTenantWorkspace._id },
          { $set: { data: clearedSourceTenantData } }
        );
      }

      return res.json({
        transferred: true,
        userName: sourceUser.name,
        transferredRecordCounts,
      });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/', async (req, res, next) => {
    try {
      const shared = await WorkspaceModel.findOne({ ownerId: getTenantId(req.user), scope: 'shared' }).lean();
      const privateWorkspace = await WorkspaceModel.findOne({
        ownerId: req.user.id,
        scope: 'user',
      }).lean();
      const license = await getCurrentLicense(shared);
      const permissions = await getRolePermissions(req.user);
      const privateData = { ...structuredClone(EMPTY_USER_WORKSPACE_DATA), ...(privateWorkspace?.data || {}) };
      const tenantEmployeeWorkspace = await WorkspaceModel.findOne({
        ownerId: getTenantId(req.user),
        scope: 'tenant',
      }).lean();
      const employeeData = tenantEmployeeWorkspace?.data ||
        (await getLegacyEmployeeData(getTenantId(req.user)));
      for (const key of employeeWorkspaceKeys) {
        if (key === 'employee_settings') {
          privateData[key] = employeeData[key] || { annualLeaveAllowanceDays: 21 };
        } else if (Array.isArray(employeeData[key])) {
          privateData[key] = employeeData[key];
        }
      }
      const visiblePrivateData = Object.fromEntries(
        Object.entries(privateData).filter(([key]) => {
          return canReadWorkspaceKey(key, permissions);
        })
      );
      return res.json({
        initialized: Boolean(shared),
        shared: Object.fromEntries(
          Object.entries(shared?.data || {})
            .filter(([key]) => SHARED_KEYS.has(key))
            .map(([key, value]) => [key, key === 'server_license' ? license : value])
        ),
        private: visiblePrivateData,
      });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/role-permissions', requireBusinessAdministrator, async (req, res, next) => {
    try {
      const workspace = await WorkspaceModel.findOne({
        ownerId: getTenantId(req.user),
        scope: 'shared',
      }).select('data.role_permissions').lean();
      const saved = workspace?.data?.role_permissions || {};
      const roles = Object.fromEntries(
        CONFIGURABLE_ROLES.map((role) => [
          role,
          role === 'business_admin'
            ? PERMISSIONS
            : saved[role] || DEFAULT_ROLE_PERMISSIONS[role],
        ])
      );
      return res.json({ permissions: PERMISSIONS, roles });
    } catch (error) {
      return next(error);
    }
  });

  router.put('/role-permissions', requireBusinessAdministrator, async (req, res, next) => {
    try {
      const submittedRoles = req.body?.roles;
      if (!isValidRolePermissions(submittedRoles)) {
        return res.status(400).json({ error: 'Role permissions contain an unknown role or permission.' });
      }
      const roles = { ...submittedRoles, business_admin: PERMISSIONS };

      const ownerId = getTenantId(req.user);
      const result = await WorkspaceModel.updateOne(
        { ownerId, scope: 'shared' },
        { $set: { 'data.role_permissions': roles } }
      );
      if (result.matchedCount !== 1) {
        return res.status(404).json({ error: 'The business workspace was not found.' });
      }
      return res.json({ saved: true, roles });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/recycling-bin', requireAdmin, async (req, res, next) => {
    try {
      const tenantId = getTenantId(req.user);
      const page = Math.max(1, Number.parseInt(String(req.query.page || '1'), 10) || 1);
      const pageSize = Math.min(100, Math.max(1, Number.parseInt(String(req.query.pageSize || '25'), 10) || 25));
      const filter = { tenantId };
      if (typeof req.query.module === 'string' && req.query.module) filter.module = req.query.module;
      if (typeof req.query.deletedBy === 'string' && req.query.deletedBy) filter.deletedBy = req.query.deletedBy;
      if (typeof req.query.from === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.from)) {
        filter.deletedAt = { ...filter.deletedAt, $gte: new Date(`${req.query.from}T00:00:00.000Z`) };
      }
      if (typeof req.query.to === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.to)) {
        filter.deletedAt = { ...filter.deletedAt, $lte: new Date(`${req.query.to}T23:59:59.999Z`) };
      }
      if (typeof req.query.search === 'string' && req.query.search.trim()) {
        const search = req.query.search.trim().slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        filter.$or = [
          { recordId: { $regex: search, $options: 'i' } },
          { recordName: { $regex: search, $options: 'i' } },
          { module: { $regex: search, $options: 'i' } },
          { deletedByName: { $regex: search, $options: 'i' } },
        ];
      }
      const sortOrder = req.query.sort === 'oldest' ? 1 : -1;
      const [entries, total, recentlyDeleted, restored, permanentlyDeleted, filteredTotal] = await Promise.all([
        RecyclingBinEntryModel.find(filter)
          .sort({ deletedAt: sortOrder, _id: sortOrder })
          .skip((page - 1) * pageSize)
          .limit(pageSize)
          .lean(),
        RecyclingBinEntryModel.countDocuments({ tenantId }),
        RecyclingBinEntryModel.countDocuments({ tenantId, deletedAt: { $gte: new Date(Date.now() - 7 * 86400000) } }),
        RecyclingBinAuditModel.countDocuments({ tenantId, action: 'restored' }),
        RecyclingBinAuditModel.countDocuments({ tenantId, action: 'permanently_deleted' }),
        RecyclingBinEntryModel.countDocuments(filter),
      ]);
      const userIds = [...new Set(entries.map((entry) => entry.deletedBy))];
      const users = await UserModel.find({ _id: { $in: userIds } }).select('_id name').lean();
      const names = new Map(users.map((user) => [String(user._id), user.name]));
      return res.json({
        entries: entries.map((entry) => ({
          id: String(entry._id),
          module: entry.module,
          dataKey: entry.dataKey,
          recordId: entry.recordId,
          recordName: entry.recordName,
          record: entry.deletedRecord,
          deletedBy: entry.deletedBy,
          deletedByName: entry.deletedByName || names.get(entry.deletedBy) || 'Unknown user',
          deletedAt: entry.deletedAt.toISOString(),
          editedBy: entry.editedBy,
          editedByName: entry.editedByName,
          editedAt: entry.editedAt?.toISOString?.() || null,
        })),
        stats: { total, recentlyDeleted, restored, permanentlyDeleted },
        pagination: { page, pageSize, total: filteredTotal, pageCount: Math.ceil(filteredTotal / pageSize) },
      });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/recycling-bin', async (req, res, next) => {
    const dataKey = typeof req.body?.dataKey === 'string' ? req.body.dataKey : '';
    const recordId = typeof req.body?.recordId === 'string' ? req.body.recordId.trim() : '';
    const replacementCategory = typeof req.body?.replacementCategory === 'string'
      ? req.body.replacementCategory.trim()
      : '';
    const definition = RECYCLABLE_WORKSPACE_KEYS[dataKey];
    if (!definition || !recordId || recordId.length > 200) {
      return res.status(400).json({ error: 'Choose a supported record and provide its ID.' });
    }
    try {
      if (!(await hasPermission(req.user, definition.permission))) {
        return res.status(403).json({ error: 'You do not have permission to delete this record.' });
      }
      const sourceScope = EMPLOYEE_RECYCLING_KEYS.has(dataKey) ? 'tenant' : 'user';
      const sourceOwnerId = sourceScope === 'tenant' ? getTenantId(req.user) : String(req.user._id);
      const tenantId = getTenantId(req.user);
      const session = await mongoose.startSession();
      let recycledEntry;
      try {
        await session.withTransaction(async () => {
          const workspace = await WorkspaceModel.findOne({ ownerId: sourceOwnerId, scope: sourceScope }).session(session);
          const records = workspace?.data?.[dataKey];
          if (!Array.isArray(records) && !(dataKey === 'categories' && Array.isArray(workspace?.data?.products))) {
            throw Object.assign(new Error('The active record list was not found.'), { statusCode: 404 });
          }
          const activeRecords = Array.isArray(records) ? records : [];
          const index = activeRecords.findIndex((record) => getRecyclingRecordId(record) === recordId);
          const products = dataKey === 'categories' && Array.isArray(workspace.data?.products)
            ? workspace.data.products
            : [];
          const categoryRecords = dataKey === 'categories' && Array.isArray(workspace.data?.category_records)
            ? workspace.data.category_records
            : [];
          const categoryRecordIndex = categoryRecords.findIndex(
            (category) => category.name?.toLowerCase() === recordId.toLowerCase()
          );
          const categoryRecord = categoryRecordIndex >= 0 ? categoryRecords.splice(categoryRecordIndex, 1)[0] : null;
          const childCategoryLinks = [];
          if (categoryRecord) {
            categoryRecords.forEach((category) => {
              if (category.parentCategoryId !== categoryRecord.id) return;
              childCategoryLinks.push(String(category.id));
              category.parentCategoryId = categoryRecord.parentCategoryId || '';
              category.updatedAt = new Date().toISOString();
            });
          }
          const categoryExistsOnProducts = dataKey === 'categories' &&
            products.some((product) => product?.category?.toLowerCase() === recordId.toLowerCase());
          if (index === -1 && !categoryExistsOnProducts) {
            throw Object.assign(new Error('The active record was not found.'), { statusCode: 404 });
          }
          const sourceRecord = index === -1 ? recordId : activeRecords.splice(index, 1)[0];
          let record = sourceRecord;
          if (dataKey === 'categories') {
            const availableCategories = [
              ...(workspace.data?.categories || []),
              ...products.map((product) => product?.category),
            ]
              .filter((category) => typeof category === 'string' && category.toLowerCase() !== recordId.toLowerCase());
            if (replacementCategory && !availableCategories.some(
              (category) => category.toLowerCase() === replacementCategory.toLowerCase()
            )) {
              throw Object.assign(new Error('Choose an existing replacement category.'), { statusCode: 400 });
            }
            const descriptions = workspace.data?.category_descriptions || {};
            const descriptionKey = Object.keys(descriptions).find(
              (category) => category.toLowerCase() === recordId.toLowerCase()
            );
            const productCategoryLinks = [];
            const replacementRecord = categoryRecords.find(
              (category) => category.name?.toLowerCase() === replacementCategory.toLowerCase()
            );
            products.forEach((product) => {
              if (product?.category?.toLowerCase() !== recordId.toLowerCase()) return;
              productCategoryLinks.push(String(product.id));
              product.category = replacementCategory;
              product.categoryId = replacementRecord?.id;
            });
            record = {
              id: recordId,
              name: recordId,
              description: descriptionKey ? descriptions[descriptionKey] : '',
              replacementCategory,
              productCategoryLinks,
              categoryRecord,
              childCategoryLinks,
            };
            if (categoryRecords.length || categoryRecord) workspace.data.category_records = categoryRecords;
            const images = workspace.data?.category_images || {};
            const imageKey = Object.keys(images).find((category) => category.toLowerCase() === recordId.toLowerCase());
            if (imageKey) {
              record.image = images[imageKey];
              delete images[imageKey];
              workspace.data.category_images = images;
            }
            if (descriptionKey) {
              delete descriptions[descriptionKey];
              workspace.data.category_descriptions = descriptions;
            }
          }
          const deletedAt = new Date();
          const [entry] = await RecyclingBinEntryModel.create([{
            tenantId,
            sourceOwnerId,
            sourceScope,
            dataKey,
            module: definition.module,
            recordId,
            recordName: getRecyclingRecordName(record, recordId),
            deletedRecord: record,
            deletedBy: String(req.user._id),
            deletedByName: req.user.name || '',
            deletedAt,
          }], { session });
          workspace.markModified('data');
          await workspace.save({ session });
          await RecyclingBinAuditModel.create([{
            tenantId,
            entryId: String(entry._id),
            recordId,
            module: definition.module,
            action: 'deleted',
            actorId: String(req.user._id),
            actorName: req.user.name || '',
            occurredAt: deletedAt,
          }], { session });
          recycledEntry = String(entry._id);
        });
      } finally {
        await session.endSession();
      }
      return res.status(201).json({ recycled: true, entryId: recycledEntry });
    } catch (error) {
      if (error?.code === 11000) return res.status(409).json({ error: 'This record is already in the Recycling Bin.' });
      if (error?.statusCode === 404) return res.status(404).json({ error: error.message });
      return next(error);
    }
  });

  router.patch('/recycling-bin/:entryId', requireAdmin, async (req, res, next) => {
    try {
      const tenantId = getTenantId(req.user);
      const session = await mongoose.startSession();
      let updatedEntry;
      try {
        await session.withTransaction(async () => {
          const entry = await RecyclingBinEntryModel.findOne({
            _id: req.params.entryId,
            tenantId,
          }).session(session);
          if (!entry) throw Object.assign(new Error('Recycling Bin record was not found.'), { statusCode: 404 });
          const updatedRecord = req.body?.record;
          if (!validateRecyclingRecord(updatedRecord, entry.recordId)) {
            throw Object.assign(new Error('Edited record must be valid and keep its original record ID.'), { statusCode: 400 });
          }
          const now = new Date();
          entry.deletedRecord = updatedRecord;
          entry.recordName = getRecyclingRecordName(updatedRecord, entry.recordId);
          entry.editedBy = String(req.user._id);
          entry.editedByName = req.user.name || '';
          entry.editedAt = now;
          await entry.save({ session });
          await RecyclingBinAuditModel.create([{
            tenantId,
            entryId: String(entry._id),
            recordId: entry.recordId,
            module: entry.module,
            action: 'edited',
            actorId: String(req.user._id),
            actorName: req.user.name || '',
            occurredAt: now,
          }], { session });
          updatedEntry = entry;
        });
      } finally {
        await session.endSession();
      }
      return res.json({
        entry: {
          id: String(updatedEntry._id),
          module: updatedEntry.module,
          dataKey: updatedEntry.dataKey,
          recordId: updatedEntry.recordId,
          recordName: updatedEntry.recordName,
          record: updatedEntry.deletedRecord,
          deletedBy: updatedEntry.deletedBy,
          deletedByName: updatedEntry.deletedByName,
          deletedAt: updatedEntry.deletedAt.toISOString(),
          editedBy: updatedEntry.editedBy,
          editedByName: updatedEntry.editedByName,
          editedAt: updatedEntry.editedAt.toISOString(),
        },
      });
    } catch (error) {
      if (error?.statusCode) return res.status(error.statusCode).json({ error: error.message });
      return next(error);
    }
  });

  router.post('/recycling-bin/restore', requireAdmin, async (req, res, next) => {
    const selectedIds = Array.isArray(req.body?.entryIds)
      ? [...new Set(req.body.entryIds.filter((id) => typeof id === 'string').slice(0, 500))]
      : [];
    if (!req.body?.all && selectedIds.length === 0) {
      return res.status(400).json({ error: 'Select at least one Recycling Bin record to restore.' });
    }
    try {
      const tenantId = getTenantId(req.user);
      const session = await mongoose.startSession();
      let restoredCount = 0;
      let skipped = [];
      try {
        await session.withTransaction(async () => {
          const filter = req.body.all ? { tenantId } : { tenantId, _id: { $in: selectedIds } };
          const entries = await RecyclingBinEntryModel.find(filter)
            .sort({ deletedAt: 1, _id: 1 })
            .limit(req.body.all ? 100 : 500)
            .session(session);
          const groups = new Map();
          entries.forEach((entry) => {
            const key = `${entry.sourceOwnerId}:${entry.sourceScope}:${entry.dataKey}`;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(entry);
          });
          const restoredEntries = [];
          for (const group of groups.values()) {
            const first = group[0];
            let workspace = await WorkspaceModel.findOne({
              ownerId: first.sourceOwnerId,
              scope: first.sourceScope,
            }).session(session);
            if (!workspace) {
              workspace = new WorkspaceModel({
                ownerId: first.sourceOwnerId,
                scope: first.sourceScope,
                data: {},
              });
            }
            const records = Array.isArray(workspace.data?.[first.dataKey])
              ? workspace.data[first.dataKey]
              : [];
            for (const entry of group) {
              const normalizedId = entry.recordId.toLocaleLowerCase();
              const existingDuplicate = records.some((record) => {
                if (getRecyclingRecordId(record).toLocaleLowerCase() === normalizedId) return true;
                if (first.dataKey !== 'products' || !record || typeof record !== 'object') return false;
                const candidate = entry.deletedRecord;
                return [candidate?.name, candidate?.sku, candidate?.barcode, candidate?.qrCode]
                  .filter((value) => typeof value === 'string' && value.trim())
                  .some((value) => [record.name, record.sku, record.barcode, record.qrCode]
                    .some((existingValue) =>
                      typeof existingValue === 'string' &&
                      existingValue.trim().toLocaleLowerCase() === value.trim().toLocaleLowerCase()
                    ));
              });
              if (existingDuplicate) {
                skipped.push({ id: String(entry._id), reason: 'A duplicate record ID or product identifier already exists.' });
                continue;
              }
              records.push(first.dataKey === 'categories'
                ? entry.recordId
                : entry.deletedRecord);
              if (first.dataKey === 'categories' && typeof entry.deletedRecord?.description === 'string') {
                workspace.data.category_descriptions = {
                  ...(workspace.data.category_descriptions || {}),
                  [entry.recordId]: entry.deletedRecord.description,
                };
                const linkedProductIds = new Set(entry.deletedRecord.productCategoryLinks || []);
                const products = Array.isArray(workspace.data?.products) ? workspace.data.products : [];
                const categoryRecords = Array.isArray(workspace.data?.category_records)
                  ? workspace.data.category_records
                  : [];
                const restoredCategory = entry.deletedRecord.categoryRecord;
                if (
                  restoredCategory &&
                  !categoryRecords.some((category) => category.id === restoredCategory.id)
                ) {
                  categoryRecords.push(restoredCategory);
                  workspace.data.category_records = categoryRecords;
                }
                if (restoredCategory) {
                  const linkedChildIds = new Set(entry.deletedRecord.childCategoryLinks || []);
                  categoryRecords.forEach((category) => {
                    if (linkedChildIds.has(String(category.id))) {
                      category.parentCategoryId = restoredCategory.id;
                      category.updatedAt = new Date().toISOString();
                    }
                  });
                  workspace.data.category_records = categoryRecords;
                }
                if (typeof entry.deletedRecord.image === 'string' && entry.deletedRecord.image) {
                  workspace.data.category_images = {
                    ...(workspace.data.category_images || {}),
                    [entry.recordId]: entry.deletedRecord.image,
                  };
                }
                products.forEach((product) => {
                  if (
                    linkedProductIds.has(String(product?.id)) &&
                    product.category === (entry.deletedRecord.replacementCategory || '')
                  ) {
                    product.category = entry.recordId;
                    product.categoryId = restoredCategory?.id;
                  }
                });
                workspace.data.products = products;
              }
              restoredEntries.push(entry);
            }
            if (group.some((entry) => !skipped.some((item) => item.id === String(entry._id)))) {
              workspace.data[first.dataKey] = records;
              workspace.markModified('data');
              await workspace.save({ session });
            }
          }
          if (restoredEntries.length) {
            const now = new Date();
            await RecyclingBinAuditModel.create(restoredEntries.map((entry) => ({
              tenantId,
              entryId: String(entry._id),
              recordId: entry.recordId,
              module: entry.module,
              action: 'restored',
              actorId: String(req.user._id),
              actorName: req.user.name || '',
              occurredAt: now,
            })), { session });
            await RecyclingBinEntryModel.deleteMany(
              { tenantId, _id: { $in: restoredEntries.map((entry) => entry._id) } },
              { session }
            );
            restoredCount = restoredEntries.length;
          }
        });
      } finally {
        await session.endSession();
      }
      const hasMore = Boolean(
        req.body.all &&
        restoredCount > 0 &&
        await RecyclingBinEntryModel.exists({ tenantId })
      );
      return res.json({ restored: restoredCount, skipped, hasMore });
    } catch (error) {
      return next(error);
    }
  });

  router.delete('/recycling-bin', requireAdmin, async (req, res, next) => {
    const selectedIds = Array.isArray(req.body?.entryIds)
      ? [...new Set(req.body.entryIds.filter((id) => typeof id === 'string').slice(0, 500))]
      : [];
    if (!req.body?.all && selectedIds.length === 0) {
      return res.status(400).json({ error: 'Select at least one Recycling Bin record to permanently delete.' });
    }
    try {
      const tenantId = getTenantId(req.user);
      const session = await mongoose.startSession();
      let deletedCount = 0;
      try {
        await session.withTransaction(async () => {
          const filter = req.body.all ? { tenantId } : { tenantId, _id: { $in: selectedIds } };
          const entries = await RecyclingBinEntryModel.find(filter)
            .sort({ deletedAt: 1, _id: 1 })
            .limit(req.body.all ? 100 : 500)
            .session(session);
          const now = new Date();
          if (entries.length) {
            await RecyclingBinAuditModel.create(entries.map((entry) => ({
              tenantId,
              entryId: String(entry._id),
              recordId: entry.recordId,
              module: entry.module,
              action: 'permanently_deleted',
              actorId: String(req.user._id),
              actorName: req.user.name || '',
              occurredAt: now,
            })), { session });
            await RecyclingBinEntryModel.deleteMany(
              { tenantId, _id: { $in: entries.map((entry) => entry._id) } },
              { session }
            );
            deletedCount = entries.length;
          }
        });
      } finally {
        await session.endSession();
      }
      const hasMore = Boolean(
        req.body.all &&
        await RecyclingBinEntryModel.exists({ tenantId })
      );
      return res.json({ permanentlyDeleted: deletedCount, hasMore });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/license', async (req, res, next) => {
    try {
      const workspace = await WorkspaceModel.findOne({
        ownerId: getTenantId(req.user),
        scope: 'shared',
      }).lean();
      const license = await getCurrentLicense(workspace);
      if (!license) {
        return res.status(404).json({ error: 'The business license workspace was not found.' });
      }
      return res.json({ license });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/license-plans', requireBusinessAdministrator, async (_req, res, next) => {
    try {
      const plans = await SubscriptionPlanModel.find({
        planId: { $in: Object.keys(LICENSE_PLANS) },
        enabled: true,
      }).sort({ planId: 1 }).lean();
      return res.json({
        plans: plans.map((plan) => ({
          id: plan.planId,
          name: plan.name,
          priceUSD: plan.priceUSD,
          durationDays: plan.durationDays,
          userLimit: plan.userLimit,
          productLimit: plan.productLimit,
          billingPeriod: plan.billingPeriod,
          enabled: plan.enabled,
        })),
        serverTimestamp: new Date().toISOString(),
      });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/license/payment-requests', requireBusinessAdministrator, async (req, res, next) => {
    try {
      const planId = typeof req.body.planId === 'string' ? req.body.planId : '';
      const trxId = typeof req.body.trxId === 'string' ? req.body.trxId.trim().toUpperCase() : '';
      const planConfig = LICENSE_PLANS[planId];
      const storedPlan = await SubscriptionPlanModel.findOne({ planId, enabled: true }).lean();
      if (!planConfig || planId === 'plan-trial' || !storedPlan || !trxId || trxId.length > 120) {
        return res.status(400).json({ error: 'Choose a valid paid plan and provide its payment transaction ID.' });
      }
      const plan = {
        name: storedPlan.name,
        price: storedPlan.priceUSD,
        durationDays: storedPlan.durationDays,
      };

      const workspace = await WorkspaceModel.findOne({
        ownerId: getTenantId(req.user),
        scope: 'shared',
      });
      if (!workspace) {
        return res.status(404).json({ error: 'The business license workspace was not found.' });
      }

      const license = await getCurrentLicense(workspace);
      if (!license) {
        return res.status(404).json({ error: 'The business license was not initialized.' });
      }
      const [duplicatePayment, legacyDuplicatePayment] = await Promise.all([
        LicensePaymentRequestModel.exists({ trxId }),
        WorkspaceModel.exists({
          scope: 'shared',
          $or: [
            { 'data.server_license.lastTrxId': trxId },
            { 'data.server_license.usedTrxIds': trxId },
            { 'data.server_license.pendingPaymentRequest.trxId': trxId },
          ],
        }),
      ]);
      if (duplicatePayment || legacyDuplicatePayment || license.usedTrxIds?.includes(trxId)) {
        return res.status(409).json({ error: 'This transaction ID has already been used for a license.' });
      }
      if (license?.pendingPaymentRequest?.status === 'pending') {
        return res.status(409).json({ error: 'A license payment request is already awaiting verification.' });
      }

      const request = {
        requestId: randomUUID(),
        planId,
        planName: plan.name,
        priceUSD: plan.price,
        durationDays: plan.durationDays,
        trxId,
        submittedAt: new Date().toISOString(),
        submittedBy: String(req.user._id),
        status: 'pending',
      };
      const updatedLicense = {
        ...license,
        pendingPaymentRequest: request,
      };
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          const currentWorkspace = await WorkspaceModel.findOne({
            _id: workspace._id,
            'data.server_license.pendingPaymentRequest.status': { $ne: 'pending' },
          }).session(session);
          if (!currentWorkspace) {
            throw Object.assign(new Error('A license payment request is already awaiting verification.'), {
              statusCode: 409,
            });
          }
          await LicensePaymentRequestModel.create([{
            requestId: request.requestId,
            tenantId: getTenantId(req.user),
            requestedBy: String(req.user._id),
            requestedByName: req.user.name,
            planId,
            planName: plan.name,
            priceUSD: plan.price,
            durationDays: plan.durationDays,
            trxId,
            submittedAt: new Date(request.submittedAt),
          }], { session });
          currentWorkspace.data.server_license = {
            ...currentWorkspace.data.server_license,
            pendingPaymentRequest: request,
          };
          await currentWorkspace.save({ session });
          await LicenseAuditModel.create([{
            tenantId: getTenantId(req.user),
            actorId: String(req.user._id),
            actorName: req.user.name,
            action: 'payment_requested',
            requestId: request.requestId,
            occurredAt: new Date(request.submittedAt),
            details: { planId, priceUSD: plan.price, trxId },
          }], { session });
        });
      } finally {
        await session.endSession();
      }
      return res.status(202).json({ license: updatedLicense });
    } catch (error) {
      if (error?.code === 11000) {
        return res.status(409).json({ error: 'This payment transaction ID has already been used.' });
      }
      if (error?.statusCode === 409) {
        return res.status(409).json({ error: error.message });
      }
      return next(error);
    }
  });

  router.post('/clear-business-data', requireAdmin, async (req, res, next) => {
    try {
      const tenantId = getTenantId(req.user);
      const tenantUsers = await UserModel.find(
        tenantId === 'business'
          ? { $or: [{ tenantId: 'business' }, { tenantId: { $exists: false } }] }
          : { tenantId }
      ).select('_id').lean();
      const ownerIds = tenantUsers.map((user) => String(user._id));
      const emptyBusinessData = {
        'data.products': [],
        'data.customers': [],
        'data.suppliers': [],
        'data.categories': [],
        'data.category_descriptions': {},
        'data.sales': [],
        'data.purchases': [],
        'data.customer_ledger': [],
        'data.supplier_ledger': [],
        'data.stock_movements': [],
        'data.payroll': [],
        'data.attendance': [],
        'data.leave_records': [],
      };

      if (ownerIds.length) {
        await WorkspaceModel.updateMany(
          { ownerId: { $in: ownerIds }, scope: 'user' },
          { $set: emptyBusinessData }
        );
      }
      await WorkspaceModel.updateOne(
        { ownerId: tenantId, scope: 'tenant' },
        { $set: { 'data.payroll': [], 'data.attendance': [], 'data.leave_records': [] } }
      );
      await Promise.all([
        AccountExpenseModel.deleteMany({ tenantId }),
        FinancialAccountModel.deleteMany({ tenantId }),
        FinancialTransactionModel.deleteMany({ tenantId }),
      ]);
      return res.json({ cleared: true });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/clear-employee-data', requireAdmin, async (req, res, next) => {
    try {
      const tenantId = getTenantId(req.user);
      const tenantUsers = await UserModel.find(
        tenantId === 'business'
          ? { $or: [{ tenantId: 'business' }, { tenantId: { $exists: false } }] }
          : { tenantId }
      ).select('_id').lean();
      const ownerIds = tenantUsers.map((user) => String(user._id));
      const emptyEmployeeData = {
        'data.payroll': [],
        'data.attendance': [],
        'data.leave_records': [],
      };

      if (ownerIds.length) {
        await WorkspaceModel.updateMany(
          { ownerId: { $in: ownerIds }, scope: 'user' },
          { $set: emptyEmployeeData }
        );
      }
      await WorkspaceModel.updateOne(
        { ownerId: tenantId, scope: 'tenant' },
        { $set: emptyEmployeeData }
      );

      return res.json({ cleared: true });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/clear-attendance-leave', requireAdmin, async (req, res, next) => {
    try {
      const tenantId = getTenantId(req.user);
      const tenantUsers = await UserModel.find(
        tenantId === 'business'
          ? { $or: [{ tenantId: 'business' }, { tenantId: { $exists: false } }] }
          : { tenantId }
      ).select('_id').lean();
      const ownerIds = tenantUsers.map((user) => String(user._id));
      const emptyRecords = {
        'data.attendance': [],
        'data.leave_records': [],
      };

      if (ownerIds.length) {
        await WorkspaceModel.updateMany(
          { ownerId: { $in: ownerIds }, scope: 'user' },
          { $set: emptyRecords }
        );
      }
      await WorkspaceModel.updateOne(
        { ownerId: tenantId, scope: 'tenant' },
        { $set: emptyRecords }
      );

      return res.json({ cleared: true });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/initialize', requireAdmin, async (req, res, next) => {
    try {
      const tenantId = getTenantId(req.user);
      const existing = await WorkspaceModel.exists({ ownerId: tenantId, scope: 'shared' });
      if (existing) return res.status(409).json({ error: 'Workspace is already initialized.' });
      const shared = req.body.shared;
      const privateData = req.body.private;
      if (
        !shared ||
        typeof shared !== 'object' ||
        Array.isArray(shared) ||
        !privateData ||
        typeof privateData !== 'object' ||
        Array.isArray(privateData)
      ) {
        return res.status(400).json({ error: 'Initial workspace data is invalid.' });
      }
      const sharedData = Object.fromEntries(
        Object.entries(shared).filter(([key]) => SHARED_KEYS.has(key))
      );
      sharedData.server_license = createTrialLicense();
      const userData = Object.fromEntries(
        Object.entries(privateData).filter(([key]) => PRIVATE_KEYS.has(key))
      );
      await WorkspaceModel.create({ ownerId: tenantId, scope: 'shared', data: sharedData });
      await WorkspaceModel.updateOne(
        { ownerId: req.user.id, scope: 'user' },
        { $setOnInsert: { data: userData } },
        { upsert: true }
      );
      return res.status(201).json({ initialized: true });
    } catch (error) {
      return next(error);
    }
  });

  router.put('/:key', async (req, res, next) => {
    try {
      const { key } = req.params;
      const isShared = SHARED_KEYS.has(key);
      if (!isShared && !PRIVATE_KEYS.has(key)) {
        return res.status(400).json({ error: 'Workspace key is not allowed.' });
      }
      if (key === 'server_license') {
        return res.status(403).json({ error: 'License changes require verified payment approval.' });
      }
      if (isShared && !['admin', 'business_owner'].includes(req.user.role)) {
        return res.status(403).json({ error: 'Business owner access required.' });
      }
      if (['payroll', 'attendance', 'leave_records', 'employee_settings'].includes(key) && !(await hasPermission(req.user, 'manage_employees'))) {
        return res.status(403).json({ error: 'You do not have permission to manage employee records.' });
      }
      const requiredPermission = getWorkspacePermission(key);
      if (
        requiredPermission &&
        requiredPermission !== 'manage_employees' &&
        !(await hasPermission(req.user, requiredPermission))
      ) {
        return res.status(403).json({ error: 'You do not have permission to update this workspace data.' });
      }
      if (key === 'settings' && !['admin', 'business_owner', 'business_admin'].includes(req.user.role)) {
        const submittedSettings = req.body?.value;
        if (!submittedSettings || typeof submittedSettings !== 'object' || Array.isArray(submittedSettings)) {
          return res.status(400).json({ error: 'Business settings must be an object.' });
        }
        const currentWorkspace = await WorkspaceModel.findOne({ ownerId: req.user.id, scope: 'user' })
          .select('data.settings')
          .lean();
        const currentSettings = currentWorkspace?.data?.settings || {};
        const profileFields = [
          'businessName',
          'ownerName',
          'phone',
          'email',
          'address',
          'registrationNumber',
          'receiptFooter',
          'taxEnabled',
          'taxRate',
          'goodsInsuranceEnabled',
          'goodsInsuranceRate',
        ];
        const safeSettings = { ...submittedSettings };
        profileFields.forEach((field) => {
          if (Object.hasOwn(currentSettings, field)) safeSettings[field] = currentSettings[field];
          else delete safeSettings[field];
        });
        req.body.value = safeSettings;
      }
      if (key === 'category_images' && (
          !req.body.value || typeof req.body.value !== 'object' || Array.isArray(req.body.value) ||
          Object.entries(req.body.value).some(([name, image]) =>
            !name.trim() || name.length > 120 || typeof image !== 'string' || image.length > 2_500_000
          )
        )) {
        return res.status(400).json({ error: 'Category images must be a valid category-to-image map.' });
      }
      if (key === 'category_records') {
        const categoryRecords = req.body.value;
        if (
          !Array.isArray(categoryRecords) ||
          categoryRecords.length > 5000 ||
          categoryRecords.some((category) =>
            !category || typeof category !== 'object' || Array.isArray(category) ||
            typeof category.id !== 'string' || !category.id.trim() || category.id.length > 150 ||
            typeof category.name !== 'string' || !category.name.trim() || category.name.length > 120 ||
            typeof category.code !== 'string' || !category.code.trim() || category.code.length > 50 ||
            typeof category.description !== 'string' || category.description.length > 1000 ||
            typeof category.image !== 'string' || category.image.length > 2_500_000 ||
            typeof category.parentCategoryId !== 'string' || category.parentCategoryId.length > 150 ||
            !['active', 'inactive'].includes(category.status) ||
            typeof category.createdAt !== 'string' || typeof category.updatedAt !== 'string'
          )
        ) {
          return res.status(400).json({ error: 'Category records contain invalid names, codes, status, or images.' });
        }
        const names = new Set();
        const codes = new Set();
        const ids = new Set();
        for (const category of categoryRecords) {
          const name = category.name.trim().toLocaleLowerCase();
          const code = category.code.trim().toLocaleLowerCase();
          if (names.has(name) || codes.has(code) || ids.has(category.id)) {
            return res.status(409).json({ error: 'Category names, codes, and IDs must be unique within this business.' });
          }
          names.add(name);
          codes.add(code);
          ids.add(category.id);
        }
        for (const category of categoryRecords) {
          if (category.parentCategoryId && !ids.has(category.parentCategoryId)) {
            return res.status(400).json({ error: 'Every parent category must exist in the same business.' });
          }
          const seen = new Set([category.id]);
          let parentId = category.parentCategoryId;
          while (parentId) {
            if (seen.has(parentId)) {
              return res.status(400).json({ error: 'Category hierarchy cannot contain a cycle.' });
            }
            seen.add(parentId);
            parentId = categoryRecords.find((parent) => parent.id === parentId)?.parentCategoryId || '';
          }
        }
      }
      if (key === 'brand_records' && (
          !Array.isArray(req.body.value) ||
          req.body.value.some((brand) =>
            !brand || typeof brand !== 'object' || Array.isArray(brand) ||
            typeof brand.id !== 'string' || !brand.id.trim() ||
            typeof brand.name !== 'string' || !brand.name.trim() || brand.name.length > 120 ||
            typeof brand.description !== 'string' || brand.description.length > 1000 ||
            typeof brand.image !== 'string' || brand.image.length > 2_500_000 ||
            typeof (brand.code || '') !== 'string' || (brand.code || '').length > 50 ||
            typeof (brand.manufacturer || '') !== 'string' || (brand.manufacturer || '').length > 200 ||
            typeof (brand.website || '') !== 'string' || (brand.website || '').length > 300 ||
            typeof (brand.contactInformation || '') !== 'string' || (brand.contactInformation || '').length > 300 ||
            !['active', 'inactive'].includes(brand.status || 'active')
          )
        )) {
        return res.status(400).json({ error: 'Brand records must include valid names, descriptions, and images.' });
      }
      if (key === 'brand_records' && Array.isArray(req.body.value)) {
        const names = new Set();
        const codes = new Set();
        for (const brand of req.body.value) {
          const name = brand.name.trim().toLocaleLowerCase();
          const code = (brand.code || '').trim().toLocaleLowerCase();
          if (names.has(name) || (code && codes.has(code))) {
            return res.status(409).json({ error: 'Brand names and codes must be unique within this business.' });
          }
          names.add(name);
          if (code) codes.add(code);
        }
      }
      if (key === 'products') {
        if (!Array.isArray(req.body.value)) {
          return res.status(400).json({ error: 'Product catalog must be a list.' });
        }
        const productNames = new Set();
        const productCodes = new Set();
        for (const product of req.body.value) {
          if (!product || typeof product !== 'object' || Array.isArray(product)) {
            return res.status(400).json({ error: 'Product catalog contains an invalid product.' });
          }
          const name = typeof product.name === 'string' ? product.name.trim().toLocaleLowerCase() : '';
          const codes = [...new Set([product.sku, product.barcode, product.qrCode]
            .filter((code) => typeof code === 'string')
            .map((code) => code.trim().toLocaleLowerCase())
            .filter(Boolean))];
          if ((name && productNames.has(name)) || codes.some((code) => productCodes.has(code))) {
            return res.status(409).json({ error: 'Product names, SKUs, barcodes, and QR codes must be unique.' });
          }
          if (name) productNames.add(name);
          codes.forEach((code) => productCodes.add(code));
        }
        const sharedWorkspace = await WorkspaceModel.findOne({
          ownerId: getTenantId(req.user),
          scope: 'shared',
        }).lean();
        const planSettings = await SubscriptionPlanModel.findOne({
          planId: sharedWorkspace?.data?.server_license?.planId,
        }).select('productLimit').lean();
        const productLimit = Number.isSafeInteger(planSettings?.productLimit)
          ? planSettings.productLimit
          : Number.POSITIVE_INFINITY;
        const tenantFilter = getTenantId(req.user) === 'business'
          ? { $or: [{ tenantId: 'business' }, { tenantId: { $exists: false } }] }
          : { tenantId: getTenantId(req.user) };
        const tenantUsers = await UserModel.find({
          $and: [tenantFilter, { deletedAt: null }],
        }).select('_id').lean();
        const tenantUserIds = tenantUsers.map((user) => String(user._id));
        if (!tenantUserIds.includes(String(req.user._id))) tenantUserIds.push(String(req.user._id));
        const productWorkspaces = await WorkspaceModel.find({
          ownerId: { $in: tenantUserIds },
          scope: 'user',
        }).select('ownerId data.products').lean();
        const privateWorkspace = productWorkspaces.find(
          (workspace) => workspace.ownerId === String(req.user._id)
        );
        const existingProducts = Array.isArray(privateWorkspace?.data?.products)
          ? privateWorkspace.data.products
          : [];
        const existingProductIds = new Set(existingProducts.map((product) => product?.id));
        const isAddingProducts = req.body.value.some((product) => !existingProductIds.has(product?.id));
        const otherUserProductCount = productWorkspaces
          .filter((workspace) => workspace.ownerId !== String(req.user._id))
          .reduce((count, workspace) => count + (
            Array.isArray(workspace.data?.products) ? workspace.data.products.length : 0
          ), 0);
        if (otherUserProductCount + req.body.value.length > productLimit && isAddingProducts) {
          return res.status(403).json({ error: 'PLAN_PRODUCT_LIMIT_REACHED' });
        }
      }
      const isEmployeeDataKey = employeeWorkspaceKeys.includes(key);
      const ownerId = isShared || isEmployeeDataKey ? getTenantId(req.user) : req.user.id;
      const scope = isShared ? 'shared' : isEmployeeDataKey ? 'tenant' : 'user';
      const previousEmployeeWorkspace = isEmployeeDataKey
        ? await WorkspaceModel.findOne({ ownerId, scope })
        : null;
      if (key === 'payroll') {
        const entries = req.body?.value;
        if (!Array.isArray(entries)) {
          return res.status(400).json({ error: 'Payroll records must be a list.' });
        }
        const seenPeriods = new Set();
        const seenIds = new Set();
        for (const entry of entries) {
          if (
            !entry ||
            typeof entry.id !== 'string' ||
            typeof entry.userId !== 'string' ||
            typeof entry.month !== 'string' ||
            !/^\d{4}-(0[1-9]|1[0-2])$/.test(entry.month) ||
            typeof entry.amount !== 'number' ||
            !Number.isFinite(entry.amount) ||
            entry.amount <= 0 ||
            typeof entry.currency !== 'string' ||
            !['pending', 'partial', 'paid'].includes(entry.status) ||
            (entry.approvalStatus !== undefined && !['pending', 'approved'].includes(entry.approvalStatus))
          ) {
            return res.status(400).json({ error: 'Payroll record details are invalid.' });
          }
          if (seenIds.has(entry.id)) {
            return res.status(409).json({ error: 'Payroll record IDs must be unique.' });
          }
          seenIds.add(entry.id);
          for (const field of [
            'bonusAmount',
            'deductionAmount',
            'allowanceAmount',
            'overtimeAmount',
            'taxDeductionAmount',
            'absenceDeductionAmount',
          ]) {
            if (entry[field] !== undefined && (typeof entry[field] !== 'number' || !Number.isFinite(entry[field]) || entry[field] < 0)) {
              return res.status(400).json({ error: 'Payroll components must be non-negative amounts.' });
            }
          }
          if (
            entry.amount +
              (entry.allowanceAmount || 0) +
              (entry.overtimeAmount || 0) +
              (entry.bonusAmount || 0) -
              (entry.deductionAmount || 0) -
              (entry.taxDeductionAmount || 0) -
              (entry.absenceDeductionAmount || 0) <= 0
          ) {
            return res.status(400).json({ error: 'Net payroll must be greater than zero.' });
          }
          const periodKey = `${entry.userId}:${entry.month}`;
          if (seenPeriods.has(periodKey)) {
            return res.status(409).json({ error: 'An employee can only have one payroll record per month.' });
          }
          seenPeriods.add(periodKey);
        }
        const currentWorkspace = previousEmployeeWorkspace?.toObject
          ? previousEmployeeWorkspace.toObject()
          : previousEmployeeWorkspace;
        const legacyEmployeeData = currentWorkspace ? null : await getLegacyEmployeeData(ownerId);
        const currentEntries = Array.isArray(currentWorkspace?.data?.payroll || legacyEmployeeData?.payroll)
          ? currentWorkspace?.data?.payroll || legacyEmployeeData.payroll
          : [];
        const currentById = new Map(currentEntries.map((entry) => [entry?.id, entry]));
        const submittedById = new Map(entries.map((entry) => [entry.id, entry]));
        const usedTransactionReferences = new Set(
          currentEntries.flatMap((entry) =>
            (Array.isArray(entry?.payments) ? entry.payments : [])
              .map((payment) => typeof payment?.transactionReference === 'string'
                ? payment.transactionReference.trim().toUpperCase()
                : '')
              .filter(Boolean)
          )
        );
        for (const entry of entries) {
          if (!currentById.has(entry.id)) {
            const tenantScope = getTenantId(req.user) === 'business'
              ? { $or: [{ tenantId: 'business' }, { tenantId: { $exists: false } }] }
              : { tenantId: getTenantId(req.user) };
            const employee = await UserModel.exists({
              $and: [
                tenantScope,
                {
                  _id: entry.userId,
                  monthlySalary: { $gt: 0 },
                  'employeeDetails.employmentStatus': { $ne: 'terminated' },
                },
              ],
            });
            if (!employee) {
              return res.status(400).json({ error: 'New payroll records must reference an employee in this business.' });
            }
          }
          if (!currentById.has(entry.id) && (
            entry.status !== 'pending' ||
            entry.approvalStatus !== 'pending' ||
            (Array.isArray(entry.payments) && entry.payments.length > 0) ||
            (Array.isArray(entry.approvalHistory) && entry.approvalHistory.length > 0)
          )) {
            return res.status(400).json({ error: 'New payroll records must start unpaid and await approval.' });
          }
        }
        for (const [id, previous] of currentById) {
          const hasPayments = (Array.isArray(previous?.payments) && previous.payments.length > 0) ||
            ['partial', 'paid'].includes(previous?.status);
          const submitted = submittedById.get(id);
          if (!submitted) {
            if (hasPayments) {
              return res.status(409).json({ error: 'Payroll records with payments cannot be deleted.' });
            }
            continue;
          }
          const previousPayments = Array.isArray(previous?.payments) ? previous.payments : [];
          const submittedPayments = Array.isArray(submitted?.payments) ? submitted.payments : [];
          if (submittedPayments.length < previousPayments.length ||
            previousPayments.some((payment, index) => JSON.stringify(payment) !== JSON.stringify(submittedPayments[index]))) {
            return res.status(409).json({ error: 'Recorded payroll payments cannot be edited or removed.' });
          }
          const addedPayments = submittedPayments.slice(previousPayments.length);
          const compensationFields = [
            'amount',
            'bonusAmount',
            'deductionAmount',
            'allowanceAmount',
            'overtimeAmount',
            'taxDeductionAmount',
            'absenceDeductionAmount',
          ];
          const compensationChanged = compensationFields.some((field) =>
            Number(previous?.[field] || 0) !== Number(submitted?.[field] || 0)
          );
          const previousApprovalHistory = Array.isArray(previous?.approvalHistory) ? previous.approvalHistory : [];
          const submittedApprovalHistory = Array.isArray(submitted?.approvalHistory) ? submitted.approvalHistory : [];
          const isApprovalTransition =
            previous?.approvalStatus === 'pending' &&
            submitted.approvalStatus === 'approved';
          if (
            previous?.approvalStatus === 'approved' &&
            submitted.approvalStatus !== 'approved' &&
            !(submitted.approvalStatus === 'pending' && compensationChanged)
          ) {
            return res.status(409).json({ error: 'Approved payroll status cannot be removed or changed.' });
          }
          if (isApprovalTransition) {
            const latestApproval = submittedApprovalHistory[submittedApprovalHistory.length - 1];
            if (
              submittedApprovalHistory.length !== previousApprovalHistory.length + 1 ||
              previousApprovalHistory.some((approval, index) =>
                JSON.stringify(approval) !== JSON.stringify(submittedApprovalHistory[index])
              ) ||
              !latestApproval ||
              typeof latestApproval.id !== 'string' ||
              latestApproval.status !== 'approved' ||
              latestApproval.approvedBy !== req.user.id ||
              typeof latestApproval.approvedAt !== 'string' ||
              !Number.isFinite(Date.parse(latestApproval.approvedAt))
            ) {
              return res.status(400).json({ error: 'Payroll approval history must include an authenticated approval event.' });
            }
            const approvalTime = new Date().toISOString();
            const approvalName = req.user.name || '';
            submittedApprovalHistory[submittedApprovalHistory.length - 1] = {
              ...latestApproval,
              approvedAt: approvalTime,
              approvedBy: req.user.id,
              approvedByName: approvalName,
            };
            submitted.approvalHistory = submittedApprovalHistory;
            submitted.approvedAt = approvalTime;
            submitted.approvedBy = req.user.id;
            submitted.approvedByName = approvalName;
          } else if (JSON.stringify(previousApprovalHistory) !== JSON.stringify(submittedApprovalHistory)) {
            return res.status(409).json({ error: 'Payroll approval history cannot be changed.' });
          }
          if (compensationChanged && submitted.approvalStatus !== 'pending') {
            return res.status(409).json({ error: 'Payroll changes must return to pending approval.' });
          }
          if (
            !compensationChanged &&
            previous?.approvalStatus !== 'pending' &&
            submitted.approvalStatus === 'pending'
          ) {
            return res.status(409).json({ error: 'Approved payroll cannot be reopened without a compensation change.' });
          }
          if (compensationChanged) {
            delete submitted.approvedAt;
            delete submitted.approvedBy;
            delete submitted.approvedByName;
          }
          if (
            previous?.approvalStatus === 'approved' &&
            submitted.approvalStatus === 'approved' &&
            (previous.approvedBy !== submitted.approvedBy ||
              previous.approvedAt !== submitted.approvedAt ||
              previous.approvedByName !== submitted.approvedByName)
          ) {
            return res.status(409).json({ error: 'Payroll approval history cannot be changed.' });
          }
          if (
            addedPayments.length > 0 &&
            submitted.approvalStatus !== 'approved' &&
            previous?.approvalStatus !== undefined
          ) {
            return res.status(409).json({ error: 'Payroll must be approved before recording payment.' });
          }
          if (hasPayments || addedPayments.length > 0) {
            const immutableFields = [
              'userId',
              'userName',
              'month',
              'currency',
              'createdAt',
              'adjustments',
              'amount',
              'bonusAmount',
              'deductionAmount',
              'allowanceAmount',
              'overtimeAmount',
              'taxDeductionAmount',
              'absenceDeductionAmount',
            ];
            if (immutableFields.some((field) => JSON.stringify(previous?.[field] ?? null) !== JSON.stringify(submitted?.[field] ?? null))) {
              return res.status(409).json({ error: 'Payroll records with payments cannot be edited. Record an authorized adjustment instead.' });
            }
          }
          for (const payment of addedPayments) {
            if (
              !payment ||
              typeof payment.amount !== 'number' ||
              !Number.isFinite(payment.amount) ||
              payment.amount <= 0 ||
              !['cash', 'evc_plus', 'zaad', 'sahal'].includes(payment.method) ||
              payment.confirmed !== true ||
              payment.recordedBy !== req.user.id ||
              typeof payment.paidAt !== 'string' ||
              !Number.isFinite(Date.parse(payment.paidAt)) ||
              (payment.transactionReference !== undefined &&
                (typeof payment.transactionReference !== 'string' || payment.transactionReference.length > 100)) ||
              (payment.method !== 'cash' &&
                (typeof payment.transactionReference !== 'string' || !payment.transactionReference.trim()))
            ) {
              return res.status(400).json({ error: 'A payment can only be recorded after an authorized user confirms it was actually paid.' });
            }
            if (payment.transactionReference?.trim()) {
              const reference = payment.transactionReference.trim().toUpperCase();
              if (usedTransactionReferences.has(reference)) {
                return res.status(409).json({ error: 'This payment transaction reference has already been recorded.' });
              }
              usedTransactionReferences.add(reference);
            }
            payment.recordedByName = req.user.name || '';
          }
          const netAmount = Math.max(
            0,
            submitted.amount +
              (submitted.allowanceAmount || 0) +
              (submitted.overtimeAmount || 0) +
              (submitted.bonusAmount || 0) -
              (submitted.deductionAmount || 0) -
              (submitted.taxDeductionAmount || 0) -
              (submitted.absenceDeductionAmount || 0)
          );
          const paidAmount = submittedPayments.reduce((total, payment) => total + payment.amount, 0);
          if (paidAmount > netAmount) {
            return res.status(400).json({ error: 'Payroll payments cannot exceed the net salary amount.' });
          }
          if (previous?.status === 'paid' && previousPayments.length === 0 && submittedPayments.length === 0) {
            if (submitted.status !== 'paid') {
              return res.status(409).json({ error: 'Legacy paid payroll records cannot be reopened or have their paid status changed.' });
            }
            continue;
          }
          const expectedStatus = paidAmount >= netAmount ? 'paid' : paidAmount > 0 ? 'partial' : 'pending';
          if (submitted.status !== expectedStatus) {
            return res.status(400).json({ error: 'Payroll status must match its recorded payment history.' });
          }
        }
      }
      if (key === 'employee_settings') {
        const settings = req.body?.value;
        if (
          !settings ||
          typeof settings !== 'object' ||
          Array.isArray(settings) ||
          !Number.isInteger(settings.annualLeaveAllowanceDays) ||
          settings.annualLeaveAllowanceDays < 0 ||
          settings.annualLeaveAllowanceDays > 365
        ) {
          return res.status(400).json({ error: 'Annual leave allowance must be a whole number between 0 and 365 days.' });
        }
      }
      if (key === 'attendance') {
        const records = req.body?.value;
        if (!Array.isArray(records)) {
          return res.status(400).json({ error: 'Attendance records must be a list.' });
        }
        const seenAttendance = new Set();
        for (const record of records) {
          const duplicateKey = `${record?.userId}:${record?.date}`;
          if (
            !record ||
            typeof record.id !== 'string' ||
            typeof record.userId !== 'string' ||
            typeof record.userName !== 'string' ||
            !isValidWorkspaceDate(record.date) ||
            !['present', 'absent', 'late', 'half_day'].includes(record.status) ||
            (record.checkInTime !== undefined && !/^([01]\d|2[0-3]):[0-5]\d$/.test(record.checkInTime)) ||
            (record.checkOutTime !== undefined && !/^([01]\d|2[0-3]):[0-5]\d$/.test(record.checkOutTime)) ||
            (record.checkInTime && record.checkOutTime && record.checkOutTime < record.checkInTime) ||
            typeof record.note !== 'string' ||
            record.note.length > 300 ||
            seenAttendance.has(duplicateKey)
          ) {
            return res.status(400).json({ error: 'Attendance records are invalid or duplicated for an employee and date.' });
          }
          seenAttendance.add(duplicateKey);
        }
      }
      if (key === 'leave_records') {
        const records = req.body?.value;
        if (!Array.isArray(records)) {
          return res.status(400).json({ error: 'Leave records must be a list.' });
        }
        const previousWorkspace = previousEmployeeWorkspace?.toObject
          ? previousEmployeeWorkspace.toObject()
          : previousEmployeeWorkspace;
        const previousEmployeeData = previousWorkspace ? null : await getLegacyEmployeeData(ownerId);
        const submittedRecords = records;
        for (const record of records) {
          if (
            !record ||
            typeof record.id !== 'string' ||
            typeof record.userId !== 'string' ||
            typeof record.userName !== 'string' ||
            !isValidWorkspaceDate(record.startDate) ||
            !isValidWorkspaceDate(record.endDate) ||
            record.endDate < record.startDate ||
            typeof record.leaveType !== 'string' ||
            !record.leaveType.trim() ||
            record.leaveType.length > 80 ||
            typeof record.reason !== 'string' ||
            !record.reason.trim() ||
            record.reason.length > 500 ||
            !['pending', 'approved', 'rejected'].includes(record.status)
          ) {
            return res.status(400).json({ error: 'Leave record details are invalid.' });
          }
          const previousRecords = previousWorkspace?.data?.leave_records || previousEmployeeData?.leave_records || [];
          const previous = previousRecords.find((item) => item?.id === record.id);
          if (previous && previous.status !== record.status &&
            (record.decidedBy !== req.user.id || typeof record.decisionAt !== 'string')) {
            return res.status(400).json({ error: 'Leave decisions must include the authenticated reviewer and decision time.' });
          }
          if (!previous && record.status !== 'pending') {
            return res.status(400).json({ error: 'New leave records must be pending review.' });
          }
          if (record.status !== 'rejected') {
            const hasOverlap = submittedRecords.some((other) =>
              other?.id !== record.id &&
              other?.userId === record.userId &&
              other?.status !== 'rejected' &&
              other?.startDate <= record.endDate &&
              other?.endDate >= record.startDate
            );
            if (hasOverlap) {
              return res.status(409).json({ error: 'An employee cannot have overlapping pending or approved leave records.' });
            }
          }
        }
      }
      if (isEmployeeDataKey) {
        if (previousEmployeeWorkspace) {
          const result = await WorkspaceModel.updateOne(
            { _id: previousEmployeeWorkspace._id, updatedAt: previousEmployeeWorkspace.updatedAt },
            { $set: { [`data.${key}`]: req.body.value } }
          );
          if (result.matchedCount !== 1) {
            return res.status(409).json({ error: 'Employee records changed in another session. Refresh and retry.' });
          }
        } else {
          const tenantWorkspace = new WorkspaceModel({
            ownerId,
            scope,
            data: await getLegacyEmployeeData(ownerId),
          });
          tenantWorkspace.data[key] = req.body.value;
          try {
            await tenantWorkspace.save();
          } catch (error) {
            if (error?.code === 11000) {
              return res.status(409).json({ error: 'Employee records changed in another session. Refresh and retry.' });
            }
            throw error;
          }
        }
      } else {
        await WorkspaceModel.updateOne(
          { ownerId, scope },
          { $set: { [`data.${key}`]: req.body.value } },
          { upsert: true }
        );
      }
      return res.json({ saved: true });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/payroll/:entryId/adjustments', async (req, res, next) => {
    try {
      if (!(await hasPermission(req.user, 'manage_employees'))) {
        return res.status(403).json({ error: 'You do not have permission to manage employee records.' });
      }
      const { kind, amount, reason } = req.body || {};
      if (!['bonus', 'deduction'].includes(kind) || typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0 ||
        typeof reason !== 'string' || !reason.trim() || reason.trim().length > 500) {
        return res.status(400).json({ error: 'Provide an adjustment type, a positive amount, and a reason of 1 to 500 characters.' });
      }
      const tenantId = getTenantId(req.user);
      let workspace = await WorkspaceModel.findOne({ ownerId: tenantId, scope: 'tenant' });
      if (!workspace) {
        workspace = new WorkspaceModel({
          ownerId: tenantId,
          scope: 'tenant',
          data: await getLegacyEmployeeData(tenantId),
        });
        await workspace.save();
      }
      const entries = Array.isArray(workspace?.data?.payroll) ? workspace.data.payroll : [];
      const entry = entries.find((item) => item?.id === req.params.entryId);
      if (!entry) return res.status(404).json({ error: 'Payroll record was not found.' });
      if (entry.approvalStatus === 'pending') {
        return res.status(409).json({ error: 'Approve payroll before recording an adjustment.' });
      }
      const currentNet = Math.max(
        0,
        Number(entry.amount) +
          (Number(entry.allowanceAmount) || 0) +
          (Number(entry.overtimeAmount) || 0) +
          (Number(entry.bonusAmount) || 0) -
          (Number(entry.deductionAmount) || 0) -
          (Number(entry.taxDeductionAmount) || 0) -
          (Number(entry.absenceDeductionAmount) || 0)
      );
      const payments = Array.isArray(entry.payments) ? entry.payments : [];
      const paidAmount = payments.length
        ? payments.reduce((total, payment) => total + (Number(payment.amount) || 0), 0)
        : entry.status === 'paid'
          ? currentNet
          : 0;
      const roundedAmount = Math.round(amount * 100) / 100;
      if (roundedAmount <= 0) {
        return res.status(400).json({ error: 'Payroll adjustments must be at least one cent.' });
      }
      if (kind === 'deduction' && (currentNet - roundedAmount <= 0 || currentNet - roundedAmount < paidAmount)) {
        return res.status(400).json({ error: 'This deduction would reduce net payroll below the amount already paid.' });
      }
      entry.adjustments = Array.isArray(entry.adjustments) ? entry.adjustments : [];
      const adjustment = {
        id: `adjust-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        kind,
        amount: roundedAmount,
        reason: reason.trim(),
        createdAt: new Date().toISOString(),
        createdBy: req.user.id,
        createdByName: req.user.name || '',
      };
      entry.adjustments.push(adjustment);
      const field = kind === 'bonus' ? 'bonusAmount' : 'deductionAmount';
      entry[field] = Math.round(((Number(entry[field]) || 0) + adjustment.amount) * 100) / 100;
      const updatedNet = Math.max(
        0,
        Number(entry.amount) +
          (Number(entry.allowanceAmount) || 0) +
          (Number(entry.overtimeAmount) || 0) +
          (Number(entry.bonusAmount) || 0) -
          (Number(entry.deductionAmount) || 0) -
          (Number(entry.taxDeductionAmount) || 0) -
          (Number(entry.absenceDeductionAmount) || 0)
      );
      entry.approvalStatus = 'pending';
      delete entry.approvedAt;
      delete entry.approvedBy;
      delete entry.approvedByName;
      entry.status = paidAmount >= updatedNet ? 'paid' : paidAmount > 0 ? 'partial' : 'pending';
      const result = await WorkspaceModel.updateOne(
        { _id: workspace._id, updatedAt: workspace.updatedAt },
        { $set: { 'data.payroll': entries } }
      );
      if (result.matchedCount !== 1) {
        return res.status(409).json({ error: 'Payroll changed in another session. Refresh and retry.' });
      }
      return res.status(201).json({ adjustment, entry });
    } catch (error) {
      return next(error);
    }
  });

  return router;
}

export async function requireActiveLicense(req, res, next) {
  try {
    const workspace = await WorkspaceModel.findOne({
      ownerId: req.user.tenantId || 'business',
      scope: 'shared',
    }).lean();
    const license = await getCurrentLicense(workspace);
    if (!license || !license.isActive || license.isLocked) {
      return res.status(423).json({ error: 'LICENSE_LOCKED' });
    }
    return next();
  } catch (error) {
    return next(error);
  }
}
