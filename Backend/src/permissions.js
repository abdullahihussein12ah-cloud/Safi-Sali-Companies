import { WorkspaceModel } from './models/Workspace.js';

export const PERMISSIONS = [
  'pos',
  'customers',
  'inventory',
  'purchases',
  'suppliers',
  'reports',
  'financial_reports',
  'business_settings',
  'manage_users',
  'manage_employees',
];

export const CONFIGURABLE_ROLES = [
  'business_admin',
  'branch_manager',
  'accountant',
  'cashier',
  'inventory_manager',
  'hr_manager',
  'employee',
];

const ALL_PERMISSIONS = [...PERMISSIONS];

export const DEFAULT_ROLE_PERMISSIONS = {
  business_admin: ['pos', 'customers', 'inventory', 'purchases', 'suppliers', 'reports', 'financial_reports', 'business_settings', 'manage_users', 'manage_employees'],
  branch_manager: ['pos', 'customers', 'inventory', 'purchases', 'suppliers', 'reports', 'financial_reports'],
  accountant: ['customers', 'purchases', 'suppliers', 'reports', 'financial_reports'],
  cashier: ['pos'],
  inventory_manager: ['inventory', 'purchases'],
  hr_manager: ['manage_employees'],
  employee: [],
};

const ROLE_ALIASES = {
  admin: 'business_owner',
  manager: 'branch_manager',
};

function canonicalRole(role) {
  return ROLE_ALIASES[role] || role;
}

export function isValidRolePermissions(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const allowedRoles = new Set(CONFIGURABLE_ROLES);
  const allowedPermissions = new Set(PERMISSIONS);
  return Object.entries(value).every(([role, permissions]) =>
    allowedRoles.has(role) &&
    Array.isArray(permissions) &&
    new Set(permissions).size === permissions.length &&
    permissions.every((permission) => allowedPermissions.has(permission))
  );
}

export async function getRolePermissions(user) {
  const role = canonicalRole(user.role);
  const workspace = await WorkspaceModel.findOne({
    ownerId: user.tenantId || 'business',
    scope: 'shared',
  }).select('data.role_permissions').lean();
  const permissions = ['business_owner', 'business_admin'].includes(role)
    ? ALL_PERMISSIONS
    : CONFIGURABLE_ROLES.includes(role)
      ? workspace?.data?.role_permissions?.[role] || DEFAULT_ROLE_PERMISSIONS[role]
      : DEFAULT_ROLE_PERMISSIONS[role] || [];
  return permissions;
}

export async function hasPermission(user, permission) {
  if (!PERMISSIONS.includes(permission)) return false;
  const permissions = await getRolePermissions(user);
  return permissions.includes(permission);
}

export function requirePermission(permission) {
  return async (req, res, next) => {
    try {
      if (await hasPermission(req.user, permission)) return next();
      return res.status(403).json({ error: 'You do not have permission to perform this action.' });
    } catch (error) {
      return next(error);
    }
  };
}

export function getWorkspacePermission(key) {
  switch (key) {
    case 'sales':
      return 'pos';
    case 'customers':
    case 'customer_ledger':
      return 'customers';
    case 'products':
    case 'categories':
    case 'category_records':
    case 'category_descriptions':
    case 'category_images':
    case 'brand_records':
    case 'stock_movements':
      return 'inventory';
    case 'purchases':
      return 'purchases';
    case 'suppliers':
    case 'supplier_ledger':
      return 'suppliers';
    case 'payroll':
    case 'attendance':
    case 'leave_records':
    case 'employee_settings':
      return 'manage_employees';
    case 'settings':
      return 'business_settings';
    default:
      return null;
  }
}

export function canReadWorkspaceKey(key, permissions) {
  if (key === 'sales') {
    return permissions.includes('pos') ||
      permissions.includes('reports') ||
      permissions.includes('financial_reports');
  }
  if (['products', 'categories', 'category_records', 'category_descriptions', 'category_images', 'brand_records'].includes(key)) {
    return permissions.includes('inventory') || permissions.includes('pos');
  }
  if (key === 'customers') {
    return permissions.includes('customers') || permissions.includes('pos');
  }
  const permission = getWorkspacePermission(key);
  return !permission || permissions.includes(permission);
}
