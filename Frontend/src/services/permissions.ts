import { PermissionKey, RoleType } from '../types';

export const ALL_PERMISSION_KEYS: PermissionKey[] = [
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

export function isBusinessOwnerRole(role: RoleType): boolean {
  return role === 'admin' || role === 'business_owner';
}

export function isBusinessAdministratorRole(role: RoleType): boolean {
  return isBusinessOwnerRole(role) || role === 'business_admin';
}

const TAB_PERMISSIONS: Record<string, PermissionKey[]> = {
  home: ['reports', 'financial_reports'],
  pos: ['pos'],
  scanner: ['pos'],
  pos_invoices: ['pos'],
  invoices: ['reports', 'financial_reports', 'pos'],
  customers: ['customers'],
  customer_debts: ['customers'],
  sales_rasiid: ['customers'],
  suppliers: ['suppliers'],
  supplier_debts: ['suppliers'],
  products: ['inventory'],
  categories: ['inventory'],
  inventory: ['inventory'],
  purchases: ['purchases'],
  reports: ['reports', 'financial_reports'],
  report_sales: ['reports', 'financial_reports'],
  report_purchases: ['reports', 'financial_reports'],
  report_inventory: ['reports', 'inventory'],
  report_cogs: ['financial_reports'],
  report_customer_balances: ['reports', 'financial_reports', 'customers'],
  report_supplier_balances: ['reports', 'financial_reports', 'suppliers'],
  users_roles: ['manage_users'],
  account: ['financial_reports'],
  employee: ['manage_employees'],
  recycling_bin: [],
  add_user: ['manage_employees'],
  choose_plan: ['business_settings'],
  settings: ['business_settings'],
};

export function hasAnyPermission(
  permissions: readonly string[],
  requiredPermissions: readonly PermissionKey[]
): boolean {
  return requiredPermissions.some((permission) => permissions.includes(permission));
}

export function getTabPermission(tab: string): PermissionKey[] {
  return TAB_PERMISSIONS[tab] || [];
}
