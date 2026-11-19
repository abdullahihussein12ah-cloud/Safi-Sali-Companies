import {
  AccountExpense,
  AccountFinanceData,
  BusinessTeamSale,
  BusinessTeamSalesSummary,
  EmployeeDetails,
  FinancialAccount,
  FinancialTransaction,
  PlatformDashboardData,
  PlatformLicenseAuditEvent,
  PlatformUser,
  SubscriptionPlanSettings,
  PlatformUserActivity,
  ServerLicenseState,
  RoleType,
  PaymentMethod,
  User,
} from '../types';

const configuredApiBaseUrl = (import.meta.env.VITE_API_URL || '').trim().replace(/\/+$/, '');
const API_BASE_URL = !configuredApiBaseUrl
  ? '/api'
  : /\/api$/i.test(configuredApiBaseUrl)
    ? configuredApiBaseUrl
    : `${configuredApiBaseUrl}/api`;
const ACCESS_TOKEN_KEY = 'maqsuud_access_token';

export class ApiConnectionError extends Error {
  constructor() {
    super('API server is unavailable.');
    this.name = 'ApiConnectionError';
  }
}

type WorkspaceData = {
  initialized: boolean;
  shared: Record<string, unknown>;
  private: Record<string, unknown>;
};

export interface TeamWorkspaceSummary {
  id: string;
  name: string;
  role: User['role'];
  active: boolean;
  createdAt: string;
  productsCount: number;
  customersCount: number;
  suppliersCount: number;
  salesCount: number;
  salesTotals: Array<{ currency: string; amount: number }>;
  purchasesCount: number;
  purchasesTotals: Array<{ currency: string; amount: number }>;
  stockMovementsCount: number;
  payrollRecordsCount: number;
  attendanceRecordsCount: number;
  leaveRecordsCount: number;
}

export interface RegisteredBusinessSummary {
  userId: string;
  tenantId: string;
  businessName: string;
  name: string;
  email: string;
  phone: string;
  dateOfBirth?: string;
  address?: string;
  jobTitle?: string;
  monthlySalary?: number;
  employeeDetails?: Partial<EmployeeDetails>;
  role: User['role'] | 'unassigned';
  accountActionsAvailable?: boolean;
  registeredAt: string;
  active: boolean;
  staffCount: number;
}

export interface TeamUserWorkspaceData {
  user: Pick<User, 'id' | 'name' | 'email' | 'phone' | 'role' | 'active' | 'createdAt'>;
  workspace: Record<string, unknown>;
  employeeRecords: Record<string, unknown>;
}

export interface RegisteredBusinessWorkspaceData {
  business: RegisteredBusinessSummary;
  members: TeamUserWorkspaceData[];
  tenantWorkspace: Record<string, unknown>;
  sharedWorkspace: Record<string, unknown>;
  accounting: Record<string, unknown>;
}

export interface HeldPosOrder {
  id: string;
  reference: string;
  status: 'held' | 'processing' | 'completed' | 'cancelled';
  items: Array<{
    productId: string;
    productName: string;
    sku: string;
    unit: string;
    quantity: number;
    unitCost: number;
    unitPrice: number;
    discount: number;
    total: number;
  }>;
  subtotal: number;
  discount: number;
  tax: number;
  goodsInsurance: number;
  totalAmount: number;
  customerId: string;
  customerName: string;
  customerPhone: string;
  tableName: string;
  branchName: string;
  saleType: 'cash' | 'credit';
  paymentMethod: PaymentMethod;
  recordedAmount: number;
  taxEnabled: boolean;
  cashierId: string;
  cashierName: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  processingBy?: string;
  processingAt?: string;
  processingToken?: string;
  completedAt?: string;
  cancelledAt?: string;
}

export interface HeldPosOrderAuditEvent {
  id: string;
  heldOrderId: string;
  reference: string;
  action: 'held' | 'updated' | 'processing' | 'released' | 'completed' | 'cancelled';
  actorId: string;
  actorName: string;
  actorRole: User['role'];
  at: string;
  details: string;
}

export interface RecyclingBinEntry {
  id: string;
  module: string;
  dataKey: string;
  recordId: string;
  recordName: string;
  record: unknown;
  deletedBy: string;
  deletedByName: string;
  deletedAt: string;
  editedBy: string;
  editedByName: string;
  editedAt: string | null;
}

export interface RecyclingBinResult {
  entries: RecyclingBinEntry[];
  stats: {
    total: number;
    recentlyDeleted: number;
    restored: number;
    permanentlyDeleted: number;
  };
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    pageCount: number;
  };
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  token?: string,
  apiBaseUrl = API_BASE_URL
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}${path}`, { ...init, headers });
  } catch {
    throw new ApiConnectionError();
  }

  const responseText = await response.text();
  let result: unknown;
  try {
    result = responseText ? JSON.parse(responseText) : undefined;
  } catch {
    result = undefined;
  }

  if (!response.ok) {
    if (
      typeof result === 'object' &&
      result !== null &&
      'error' in result &&
      typeof result.error === 'string'
    ) {
      throw new Error(result.error);
    }
    const contentType = response.headers.get('content-type')?.split(';', 1)[0] || 'unknown response type';
    if (response.status === 404 && contentType === 'text/html') {
      throw new Error('');
    }
    throw new Error(`Request to ${apiBaseUrl}${path} failed with HTTP ${response.status} ${response.statusText} (${contentType}).`);
  }
  if (result === undefined) {
    throw new Error(`The server returned an empty or invalid response for ${apiBaseUrl}${path} (HTTP ${response.status}).`);
  }
  return result as T;
}

export const getStoredAccessToken = (): string | null =>
  sessionStorage.getItem(ACCESS_TOKEN_KEY) || localStorage.getItem(ACCESS_TOKEN_KEY);

export const clearStoredAccessToken = (): void => {
  sessionStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem('maqsuud_auth_token');
};

type MySqlPlatformUser = {
  id: string;
  name: string;
  email: string;
  role: User['role'];
  businessId: string | null;
  profileImageUrl: string | null;
  createdAt: string;
};

function normalizeMySqlPlatformUser(user: MySqlPlatformUser): User {
  return {
    id: String(user.id),
    name: user.name,
    email: user.email,
    role: user.role,
    phone: '',
    avatar: user.profileImageUrl || undefined,
    active: true,
    createdAt: user.createdAt,
  };
}

export async function loginWithPassword(
  email: string,
  password: string
): Promise<{ token: string; user: User }> {
  const result = await request<{ token: string; user: MySqlPlatformUser }>('/mysql-auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  if (!result.token || !result.user?.id || !result.user?.role) {
    throw new Error('The MySQL authentication service returned an invalid sign-in response.');
  }
  const user = normalizeMySqlPlatformUser(result.user);
  sessionStorage.setItem(ACCESS_TOKEN_KEY, result.token);
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  return { token: result.token, user };
}

export async function createBusinessAccount(account: {
  name: string;
  phone: string;
  email: string;
  password: string;
  role: 'business_owner';
}): Promise<{
  email: string;
  verificationRequired: boolean;
  emailSent: boolean;
  expiresInSeconds: number;
  resendAfterSeconds: number;
}> {
  return request('/auth/register', {
    method: 'POST',
    body: JSON.stringify(account),
  });
}

export async function resendEmailVerificationCode(email: string): Promise<void> {
  await request<{ message: string }>('/auth/resend-verification-code', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export async function verifyEmailAddress(
  email: string,
  code: string
): Promise<{ token: string; user: User }> {
  const result = await request<{ token: string; user: User }>('/auth/verify-email', {
    method: 'POST',
    body: JSON.stringify({ email, code }),
  });
  if (!result.token || !result.user?.id || result.user.isEmailVerified !== true) {
    throw new Error('The server returned an invalid email verification response.');
  }
  sessionStorage.setItem(ACCESS_TOKEN_KEY, result.token);
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  return result;
}

export async function requestPasswordReset(email: string): Promise<void> {
  await request<{ message: string }>('/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export async function resendPasswordResetCode(email: string): Promise<void> {
  await request<{ message: string }>('/auth/resend-reset-code', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export async function verifyPasswordResetCode(
  email: string,
  code: string
): Promise<string> {
  const result = await request<{ resetToken: string }>('/auth/verify-reset-code', {
    method: 'POST',
    body: JSON.stringify({ email, code }),
  });
  if (typeof result.resetToken !== 'string' || !/^[a-f0-9]{64}$/.test(result.resetToken)) {
    throw new Error('The server returned an invalid password reset token.');
  }
  return result.resetToken;
}

export async function completePasswordReset(token: string, password: string): Promise<void> {
  await request<{ message: string }>('/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token, password }),
  });
}

export async function getAuthenticatedUser(token: string): Promise<User> {
  const result = await request<{ user: MySqlPlatformUser }>('/mysql-auth/me', {}, token);
  if (!result.user?.id || !result.user?.role) {
    throw new Error('The MySQL authentication service returned an invalid session response.');
  }
  return normalizeMySqlPlatformUser(result.user);
}

export async function getStaffUsers(token: string): Promise<User[]> {
  const result = await request<{ users: User[] }>('/auth/users', {}, token);
  if (!Array.isArray(result.users) || result.users.some((user) =>
    !user || typeof user.id !== 'string' || typeof user.role !== 'string' ||
    typeof user.name !== 'string' || typeof user.active !== 'boolean'
  )) {
    throw new Error('The server returned an invalid user list. Refresh the page or contact support.');
  }
  return result.users;
}

export async function createStaffUser(
  token: string,
  user: {
    name: string;
    email: string;
    phone: string;
    monthlySalary?: number;
    jobTitle?: string;
    address?: string;
    dateOfBirth?: string;
    employeeDetails?: Partial<EmployeeDetails>;
    active?: boolean;
    role: User['role'];
    password?: string;
  }
): Promise<{ user: User; temporaryPassword: string }> {
  const result = await request<{ user: User; temporaryPassword: string }>('/auth/users', {
    method: 'POST',
    body: JSON.stringify(user),
  }, token);
  return result;
}

export async function updateStaffUser(
  token: string,
  userId: string,
  updates: {
    name: string;
    email: string;
    phone: string;
    monthlySalary?: number;
    jobTitle?: string;
    address?: string;
    dateOfBirth?: string;
    employeeDetails?: Partial<EmployeeDetails>;
    role: User['role'];
    active: boolean;
    password?: string;
  }
): Promise<{ user: User; temporaryPassword: string | null }> {
  const result = await request<{ user: User; temporaryPassword: string | null }>(`/auth/users/${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  }, token);
  return result;
}

export async function getWorkspace(token: string): Promise<WorkspaceData> {
  return request<WorkspaceData>('/workspace', {}, token);
}

export async function getTeamWorkspaceOverview(token: string): Promise<{
  staff: TeamWorkspaceSummary[];
  roleCounts: Record<string, number>;
}> {
  return request('/workspace/team-overview', {}, token);
}

export async function getTeamUserWorkspaceData(token: string, userId: string): Promise<TeamUserWorkspaceData> {
  return request(`/workspace/team-users/${encodeURIComponent(userId)}/data`, {}, token);
}

export async function getRegisteredBusinessSummaries(token: string): Promise<RegisteredBusinessSummary[]> {
  const result = await request<{ businesses: unknown }>('/workspace/registered-businesses', {}, token);
  if (!Array.isArray(result.businesses)) {
    throw new Error('The server returned an invalid registered account list. Refresh the page or contact support.');
  }
  const validRoles = new Set<RoleType>([
    'admin', 'manager', 'cashier', 'accountant', 'business_owner', 'business_admin',
    'branch_manager', 'inventory_manager', 'hr_manager', 'employee', 'super_admin',
  ]);
  const legacyRoleAliases: Record<string, RoleType> = {
    administrator: 'admin',
    'super administrator': 'super_admin',
    'super-admin': 'super_admin',
    'business admin': 'business_admin',
    'business owner': 'business_owner',
    'store manager': 'branch_manager',
    'branch manager': 'branch_manager',
    'inventory manager': 'inventory_manager',
    'hr manager': 'hr_manager',
    account: 'accountant',
    'full access owner': 'admin',
    'admin full access owner': 'admin',
  };
  return result.businesses.flatMap((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
    const account = entry as Record<string, unknown>;
    const userId = typeof account.userId === 'string'
      ? account.userId
      : typeof account._id === 'string'
        ? account._id
        : typeof account.id === 'string'
          ? account.id
          : '';
    const roleValue = [account.role, account.posRole, account.securityRole, account.accessRole]
      .find((value) => typeof value === 'string' && value.trim());
    const rawRole = typeof roleValue === 'string'
      ? roleValue.trim().toLowerCase().replaceAll('_', ' ')
      : '';
    const normalizedRole = legacyRoleAliases[rawRole] || rawRole.replaceAll(' ', '_');
    const role = validRoles.has(normalizedRole as RoleType)
      ? normalizedRole as RoleType
      : 'unassigned';
    const canManageAccount = Boolean(userId);
    const name = typeof account.name === 'string' && account.name.trim()
      ? account.name
      : typeof account.businessName === 'string' && account.businessName.trim()
        ? account.businessName
        : typeof account.email === 'string' && account.email.trim()
          ? account.email
          : `Unnamed ${role.replaceAll('_', ' ')} account`;
    return {
      userId: userId || `unavailable-account-${index + 1}`,
      tenantId: typeof account.tenantId === 'string' && account.tenantId
        ? account.tenantId
        : role === 'super_admin' ? 'platform' : 'business',
      name,
      businessName: typeof account.businessName === 'string' ? account.businessName : name,
      email: typeof account.email === 'string' ? account.email : '',
      phone: typeof account.phone === 'string' ? account.phone : '',
      role,
      accountActionsAvailable: canManageAccount,
      dateOfBirth: typeof account.dateOfBirth === 'string' ? account.dateOfBirth : undefined,
      address: typeof account.address === 'string' ? account.address : undefined,
      jobTitle: typeof account.jobTitle === 'string' ? account.jobTitle : undefined,
      monthlySalary: typeof account.monthlySalary === 'number' && Number.isFinite(account.monthlySalary)
        ? account.monthlySalary
        : undefined,
      employeeDetails: account.employeeDetails && typeof account.employeeDetails === 'object'
        ? account.employeeDetails as Partial<EmployeeDetails>
        : undefined,
      active: typeof account.active === 'boolean' ? account.active : false,
      registeredAt: typeof account.registeredAt === 'string' ? account.registeredAt : '',
      staffCount: typeof account.staffCount === 'number' && Number.isFinite(account.staffCount)
        ? account.staffCount
        : 0,
    };
  });
}

export async function updateRegisteredBusinessUser(
  token: string,
  tenantId: string,
  userId: string,
  changes: { name: string; email: string; phone: string; role: User['role']; active: boolean }
): Promise<void> {
  await request(
    `/workspace/registered-businesses/${encodeURIComponent(tenantId)}/users/${encodeURIComponent(userId)}`,
    { method: 'PATCH', body: JSON.stringify(changes) },
    token
  );
}

export async function deleteRegisteredBusinessUser(
  token: string,
  tenantId: string,
  userId: string
): Promise<void> {
  await request(
    `/workspace/registered-businesses/${encodeURIComponent(tenantId)}/users/${encodeURIComponent(userId)}`,
    { method: 'DELETE' },
    token
  );
}

export async function getRegisteredBusinessWorkspaceData(
  token: string,
  tenantId: string
): Promise<RegisteredBusinessWorkspaceData> {
  return request(`/workspace/registered-businesses/${encodeURIComponent(tenantId)}/data`, {}, token);
}

export async function getHeldPosOrders(token: string): Promise<{
  orders: HeldPosOrder[];
  audit: HeldPosOrderAuditEvent[];
}> {
  const result = await request<{
    orders: HeldPosOrder[];
    audit: HeldPosOrderAuditEvent[];
  }>('/workspace/held-orders', {}, token);
  if (!Array.isArray(result.orders) || !Array.isArray(result.audit)) {
    throw new Error('The server returned an invalid held orders response.');
  }
  return result;
}

export async function createHeldPosOrder(
  token: string,
  order: Omit<HeldPosOrder, 'id' | 'reference' | 'status' | 'cashierId' | 'cashierName' | 'createdAt' | 'updatedAt' | 'version'>
): Promise<HeldPosOrder> {
  const result = await request<{ order: HeldPosOrder }>('/workspace/held-orders', {
    method: 'POST',
    body: JSON.stringify(order),
  }, token);
  return result.order;
}

export async function updateHeldPosOrder(
  token: string,
  order: HeldPosOrder
): Promise<HeldPosOrder> {
  const result = await request<{ order: HeldPosOrder }>(`/workspace/held-orders/${encodeURIComponent(order.id)}`, {
    method: 'PUT',
    body: JSON.stringify({ ...order, version: order.version }),
  }, token);
  return result.order;
}

export async function completeHeldPosOrder(token: string, orderId: string, processingToken: string): Promise<HeldPosOrder> {
  const result = await request<{ order: HeldPosOrder }>(
    `/workspace/held-orders/${encodeURIComponent(orderId)}/complete`,
    { method: 'POST', body: JSON.stringify({ processingToken }) },
    token
  );
  return result.order;
}

export async function claimHeldPosOrder(token: string, orderId: string): Promise<HeldPosOrder> {
  const result = await request<{ order: HeldPosOrder }>(
    `/workspace/held-orders/${encodeURIComponent(orderId)}/claim`,
    { method: 'POST' },
    token
  );
  return result.order;
}

export async function releaseHeldPosOrder(token: string, orderId: string, processingToken: string): Promise<HeldPosOrder> {
  const result = await request<{ order: HeldPosOrder }>(
    `/workspace/held-orders/${encodeURIComponent(orderId)}/release`,
    { method: 'POST', body: JSON.stringify({ processingToken }) },
    token
  );
  return result.order;
}

export async function cancelHeldPosOrder(token: string, orderId: string): Promise<HeldPosOrder> {
  const result = await request<{ order: HeldPosOrder }>(
    `/workspace/held-orders/${encodeURIComponent(orderId)}`,
    { method: 'DELETE' },
    token
  );
  return result.order;
}

export async function transferBusinessAdminWorkspaceToOwner(
  token: string,
  tenantId: string,
  userId: string
): Promise<{ transferred: boolean; userName: string; transferredRecordCounts: Record<string, number> }> {
  return request(
    `/workspace/registered-businesses/${encodeURIComponent(tenantId)}/users/${encodeURIComponent(userId)}/transfer-to-owner`,
    { method: 'POST' },
    token
  );
}

export async function getWorkspaceLicense(token: string): Promise<ServerLicenseState> {
  const result = await request<{ license: ServerLicenseState }>('/workspace/license', {}, token);
  return result.license;
}

export async function getRolePermissions(token: string): Promise<{
  permissions: string[];
  roles: Record<string, string[]>;
}> {
  const result = await request<{
    permissions: string[];
    roles: Record<string, string[]>;
  }>('/workspace/role-permissions', {}, token);
  if (
    !Array.isArray(result.permissions) ||
    result.permissions.some((permission) => typeof permission !== 'string') ||
    !result.roles ||
    typeof result.roles !== 'object' ||
    Array.isArray(result.roles) ||
    Object.values(result.roles).some((permissions) =>
      !Array.isArray(permissions) || permissions.some((permission) => typeof permission !== 'string')
    )
  ) {
    throw new Error('The server returned invalid role permissions. Refresh the page or contact support.');
  }
  return result;
}

export async function getMyPermissions(token: string): Promise<string[]> {
  const result = await request<{ permissions: string[] }>('/workspace/my-permissions', {}, token);
  if (!Array.isArray(result.permissions) || result.permissions.some((permission) => typeof permission !== 'string')) {
    throw new Error('The server returned an invalid permission list.');
  }
  return result.permissions;
}

export async function getBusinessTeamActivity(
  token: string,
  page: number
): Promise<{
  sales: BusinessTeamSale[];
  staff: BusinessTeamSalesSummary[];
  pagination: { page: number; pageSize: number; total: number; pageCount: number };
}> {
  const query = new URLSearchParams({ page: String(page) });
  const result = await request<{
    sales: BusinessTeamSale[];
    staff: BusinessTeamSalesSummary[];
    pagination: { page: number; pageSize: number; total: number; pageCount: number };
  }>(`/workspace/team-activity?${query.toString()}`, {}, token);
  if (!Array.isArray(result.sales) || !Array.isArray(result.staff)) {
    throw new Error('The server returned an invalid team activity response.');
  }
  return result;
}

export async function getPlatformDashboard(token: string): Promise<PlatformDashboardData> {
  const result = await request<PlatformDashboardData>('/super-admin/dashboard', {}, token);
  if (!Array.isArray(result.businesses)) {
    throw new Error('The server returned an invalid platform dashboard.');
  }
  return result;
}

export async function getPlatformUsers(
  token: string,
  view: 'active' | 'deleted',
  page: number,
  search: string,
  role: string,
  status: '' | 'active' | 'inactive'
): Promise<{
  users: PlatformUser[];
  pagination: { page: number; pageSize: number; total: number; pageCount: number };
}> {
  const query = new URLSearchParams({
    view,
    page: String(page),
    pageSize: '50',
    search,
    role,
    status,
  });
  const result = await request<{
    users: PlatformUser[];
    pagination: { page: number; pageSize: number; total: number; pageCount: number };
  }>(`/super-admin/users?${query.toString()}`, {}, token);
  if (!Array.isArray(result.users) || !result.pagination) {
    throw new Error('The server returned an invalid platform user list.');
  }
  return result;
}

export async function getPlatformUserActivity(
  token: string,
  page: number
): Promise<{
  events: PlatformUserActivity[];
  pagination: { page: number; pageSize: number; total: number; pageCount: number };
}> {
  const query = new URLSearchParams({ page: String(page), pageSize: '50' });
  const result = await request<{
    events: PlatformUserActivity[];
    pagination: { page: number; pageSize: number; total: number; pageCount: number };
  }>(`/super-admin/user-activity?${query.toString()}`, {}, token);
  if (!Array.isArray(result.events) || !result.pagination) {
    throw new Error('The server returned an invalid platform activity list.');
  }
  return result;
}

export async function deletePlatformUser(token: string, userId: string): Promise<void> {
  await request(`/super-admin/users/${encodeURIComponent(userId)}`, { method: 'DELETE' }, token);
}

export async function updatePlatformUser(
  token: string,
  userId: string,
  changes: { name: string; email: string; phone: string; role: string; active: boolean }
): Promise<PlatformUser> {
  const result = await request<{ user: PlatformUser }>(
    `/super-admin/users/${encodeURIComponent(userId)}`,
    { method: 'PATCH', body: JSON.stringify(changes) },
    token
  );
  if (!result.user?.id) throw new Error('The server returned an invalid updated user.');
  return result.user;
}

export async function restorePlatformUser(token: string, userId: string): Promise<void> {
  await request(`/super-admin/users/${encodeURIComponent(userId)}/restore`, { method: 'POST' }, token);
}

export async function permanentlyDeletePlatformUser(token: string, userId: string): Promise<void> {
  await request(
    `/super-admin/users/${encodeURIComponent(userId)}/permanent`,
    { method: 'DELETE' },
    token
  );
}

export async function decidePlatformLicenseRequest(
  token: string,
  requestId: string,
  decision: 'approve' | 'reject'
): Promise<void> {
  await request<{ decided: boolean; status: 'approved' | 'rejected' }>(
    `/super-admin/license-requests/${encodeURIComponent(requestId)}/${decision}`,
    { method: 'POST' },
    token
  );
}

export async function managePlatformLicense(
  token: string,
  tenantId: string,
  action: 'suspend' | 'reactivate' | 'extend',
  days?: number
): Promise<void> {
  await request(
    `/super-admin/businesses/${encodeURIComponent(tenantId)}/license/${action}`,
    {
      method: 'POST',
      body: JSON.stringify(action === 'extend' ? { days } : {}),
    },
    token
  );
}

export async function getPlatformLicenseAudit(token: string): Promise<PlatformLicenseAuditEvent[]> {
  const result = await request<{
    events: PlatformLicenseAuditEvent[];
  }>('/super-admin/license-audit?page=1&pageSize=100', {}, token);
  if (!Array.isArray(result.events)) {
    throw new Error('The server returned an invalid license audit log.');
  }
  return result.events;
}

export async function getPlatformSubscriptionPlans(token: string): Promise<SubscriptionPlanSettings[]> {
  const result = await request<{ plans: Array<Omit<SubscriptionPlanSettings, 'id'> & { planId: string }> }>(
    '/super-admin/subscription-plans',
    {},
    token
  );
  if (!Array.isArray(result.plans)) {
    throw new Error('The server returned an invalid subscription plan list.');
  }
  return result.plans.map(({ planId, ...plan }) => ({ id: planId, ...plan }));
}

export async function updatePlatformSubscriptionPlan(
  token: string,
  plan: Omit<SubscriptionPlanSettings, 'enabled'>
): Promise<void> {
  await request(`/super-admin/subscription-plans/${encodeURIComponent(plan.id)}`, {
    method: 'PUT',
    body: JSON.stringify({
      name: plan.name,
      priceUSD: plan.priceUSD,
      durationDays: plan.durationDays,
      userLimit: plan.userLimit,
      productLimit: plan.productLimit,
    }),
  }, token);
}

export async function getBusinessSubscriptionPlans(token: string): Promise<SubscriptionPlanSettings[]> {
  const path = '/workspace/license-plans';
  let result: { plans: Array<Omit<SubscriptionPlanSettings, 'id'> & { id: string }> };
  try {
    result = await request(path, {}, token);
  } catch (error) {
    if (error instanceof Error && /\bHTTP 404\b/.test(error.message)) {
      throw new Error(
        'The subscription plans API is missing from the backend. Deploy or restart the updated Backend service, then reload this page.'
      );
    }
    throw error;
  }
  if (!Array.isArray(result.plans)) {
    throw new Error('The server returned an invalid license plan list.');
  }
  return result.plans;
}

export async function getRecyclingBin(
  token: string,
  filters: {
    page: number;
    pageSize?: number;
    search?: string;
    module?: string;
    deletedBy?: string;
    from?: string;
    to?: string;
    sort?: 'newest' | 'oldest';
  }
): Promise<RecyclingBinResult> {
  const query = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== '') query.set(key, String(value));
  });
  return request(`/workspace/recycling-bin?${query.toString()}`, {}, token);
}

export async function moveWorkspaceRecordToRecyclingBin(
  token: string,
  dataKey: string,
  recordId: string,
  replacementCategory?: string
): Promise<void> {
  await request('/workspace/recycling-bin', {
    method: 'POST',
    body: JSON.stringify({ dataKey, recordId, replacementCategory }),
  }, token);
}

export async function editRecyclingBinRecord(
  token: string,
  entryId: string,
  record: unknown
): Promise<RecyclingBinEntry> {
  const result = await request<{ entry: RecyclingBinEntry }>(
    `/workspace/recycling-bin/${encodeURIComponent(entryId)}`,
    { method: 'PATCH', body: JSON.stringify({ record }) },
    token
  );
  return result.entry;
}

export async function restoreRecyclingBinRecords(
  token: string,
  entryIds: string[] = [],
  all = false
): Promise<{ restored: number; skipped: Array<{ id: string; reason: string }>; hasMore: boolean }> {
  return request('/workspace/recycling-bin/restore', {
    method: 'POST',
    body: JSON.stringify({ entryIds, all }),
  }, token);
}

export async function permanentlyDeleteRecyclingBinRecords(
  token: string,
  entryIds: string[] = [],
  all = false
): Promise<{ permanentlyDeleted: number; hasMore: boolean }> {
  return request('/workspace/recycling-bin', {
    method: 'DELETE',
    body: JSON.stringify({ entryIds, all }),
  }, token);
}

export async function getPlatformBusinessActivity(
  token: string,
  tenantId: string,
  page: number
): Promise<{
  sales: BusinessTeamSale[];
  pagination: { page: number; pageSize: number; total: number; pageCount: number };
}> {
  const query = new URLSearchParams({ page: String(page) });
  return request<{
    sales: BusinessTeamSale[];
    pagination: { page: number; pageSize: number; total: number; pageCount: number };
  }>(
    `/super-admin/businesses/${encodeURIComponent(tenantId)}/activity?${query.toString()}`,
    {},
    token
  );
}

export async function saveRolePermissions(
  token: string,
  roles: Record<string, string[]>
): Promise<void> {
  await request('/workspace/role-permissions', {
    method: 'PUT',
    body: JSON.stringify({ roles }),
  }, token);
}

export async function createPayrollAdjustment(
  token: string,
  entryId: string,
  adjustment: { kind: 'bonus' | 'deduction'; amount: number; reason: string }
): Promise<{ entry: import('../types').PayrollEntry }> {
  return request(`/workspace/payroll/${encodeURIComponent(entryId)}/adjustments`, {
    method: 'POST',
    body: JSON.stringify(adjustment),
  }, token);
}

export async function clearBusinessData(token: string): Promise<void> {
  await request<{ cleared: boolean }>('/workspace/clear-business-data', {
    method: 'POST',
  }, token);
}

export async function clearEmployeeData(token: string): Promise<void> {
  await request<{ cleared: boolean }>('/workspace/clear-employee-data', {
    method: 'POST',
  }, token);
}

export async function clearAttendanceLeaveRecords(token: string): Promise<void> {
  await request<{ cleared: boolean }>('/workspace/clear-attendance-leave', {
    method: 'POST',
  }, token);
}

export async function getAccountFinance(
  token: string,
  startDate: string,
  endDate: string
): Promise<AccountFinanceData> {
  const query = new URLSearchParams({ startDate, endDate });
  return request<AccountFinanceData>(`/accounting?${query.toString()}`, {}, token);
}

export async function createAccountExpense(
  token: string,
  expense: Omit<AccountExpense, 'id' | 'createdBy' | 'createdByName'>
): Promise<AccountExpense> {
  const result = await request<{ expense: AccountExpense }>('/accounting/expenses', {
    method: 'POST',
    body: JSON.stringify(expense),
  }, token);
  return result.expense;
}

export async function createFinancialAccount(
  token: string,
  account: Omit<FinancialAccount, 'id' | 'balance'>
): Promise<FinancialAccount> {
  const result = await request<{ account: FinancialAccount }>('/accounting/accounts', {
    method: 'POST',
    body: JSON.stringify(account),
  }, token);
  return result.account;
}

export async function createFinancialTransaction(
  token: string,
  transaction: Pick<FinancialTransaction, 'accountId' | 'type' | 'category' | 'description' | 'amount' | 'currency' | 'date' | 'reference'>
): Promise<void> {
  await request('/accounting/transactions', {
    method: 'POST',
    body: JSON.stringify(transaction),
  }, token);
}

export async function reconcileFinancialTransaction(token: string, transactionId: string): Promise<void> {
  await request(`/accounting/transactions/${encodeURIComponent(transactionId)}/reconcile`, {
    method: 'POST',
  }, token);
}

export async function reconcileAccountExpense(token: string, expenseId: string): Promise<void> {
  await request(`/accounting/expenses/${encodeURIComponent(expenseId)}/reconcile`, {
    method: 'POST',
  }, token);
}

export async function adjustFinancialTransaction(
  token: string,
  transactionId: string,
  adjustment: { type: 'income' | 'expense'; amount: number; reason: string; date: string; reference?: string }
): Promise<void> {
  await request(`/accounting/transactions/${encodeURIComponent(transactionId)}/adjustments`, {
    method: 'POST',
    body: JSON.stringify(adjustment),
  }, token);
}

export async function adjustAccountExpense(
  token: string,
  expenseId: string,
  adjustment: { type: 'income' | 'expense'; amount: number; reason: string; date: string; reference?: string }
): Promise<void> {
  await request(`/accounting/expenses/${encodeURIComponent(expenseId)}/adjustments`, {
    method: 'POST',
    body: JSON.stringify(adjustment),
  }, token);
}

export async function initializeWorkspace(
  token: string,
  shared: Record<string, unknown>,
  privateData: Record<string, unknown>
): Promise<void> {
  await request('/workspace/initialize', {
    method: 'POST',
    body: JSON.stringify({ shared, private: privateData }),
  }, token);
}

export async function saveWorkspaceValue(
  token: string,
  key: string,
  value: unknown
): Promise<void> {
  await request(`/workspace/${encodeURIComponent(key)}`, {
    method: 'PUT',
    body: JSON.stringify({ value }),
  }, token);
}

export async function submitLicensePaymentRequest(
  token: string,
  planId: string,
  trxId: string
): Promise<ServerLicenseState> {
  const result = await request<{ license: ServerLicenseState }>('/workspace/license/payment-requests', {
    method: 'POST',
    body: JSON.stringify({ planId, trxId }),
  }, token);
  return result.license;
}
