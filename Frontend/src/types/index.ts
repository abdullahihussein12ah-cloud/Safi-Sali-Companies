export type RoleType =
  | 'admin'
  | 'manager'
  | 'cashier'
  | 'accountant'
  | 'business_owner'
  | 'business_admin'
  | 'affiliate'
  | 'finance_admin'
  | 'branch_manager'
  | 'inventory_manager'
  | 'hr_manager'
  | 'employee'
  | 'super_admin';
export type PermissionKey =
  | 'pos'
  | 'customers'
  | 'inventory'
  | 'purchases'
  | 'suppliers'
  | 'reports'
  | 'financial_reports'
  | 'business_settings'
  | 'manage_users'
  | 'manage_employees';
export type CurrencyCode = string;
export type PaymentMethod =
  | 'cash'
  | 'evc_plus'
  | 'zaad'
  | 'sahal'
  | 'premier_wallet'
  | 'card'
  | 'deyn'; // Credit Sale
export type PayrollPaymentMethod = 'cash' | 'evc_plus' | 'zaad' | 'sahal';
export type PaymentStatus = 'paid' | 'partial' | 'unpaid' | 'refunded';
export type StockMovementType = 'sale' | 'restock' | 'adjustment' | 'damage' | 'return' | 'initial';
export type UnitType = 'piece' | 'box' | 'kg' | 'liter' | 'meter' | 'packet' | 'carton' | 'set' | (string & {});

export interface EmployeeDetails {
  firstName: string;
  middleName: string;
  lastName: string;
  serialNumber: string;
  gender: 'female' | 'male' | '';
  nationality: string;
  residenceType: 'local' | 'foreigner' | '';
  nationalId: string;
  passportNumber: string;
  payrollInvited: boolean;
  jobTitle: string;
  department: string;
  employmentType: string;
  employmentStartDate: string;
  employmentStatus: 'active' | 'on_leave' | 'terminated';
  bankName: string;
  bankAccountNumber: string;
  medicalNotes: string;
  emergencyContactName: string;
  emergencyContactRelationship: string;
  emergencyContactPhone: string;
  emergencyContactAddress: string;
  evcPlusPhone: string;
  zaadPhone: string;
  sahalPhone: string;
  photo: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: RoleType;
  phone: string;
  dateOfBirth?: string;
  address?: string;
  jobTitle?: string;
  monthlySalary?: number;
  employeeDetails?: Partial<EmployeeDetails>;
  avatar?: string;
  isEmailVerified?: boolean;
  active: boolean;
  createdAt: string;
}

export interface PlatformUser extends User {
  tenantId: string;
  businessName: string;
  planId: string;
  planName: string;
  createdBy: string;
  createdByName: string;
  deletedAt: string;
  deletedBy: string;
  deletedByName: string;
}

export interface PlatformUserActivity {
  id: string;
  action: 'registered' | 'user_created' | 'user_updated' | 'user_deleted' | 'user_restored' | 'user_permanently_deleted';
  actorId: string;
  actorName: string;
  targetUserId: string;
  targetName: string;
  targetEmail: string;
  targetRole: string;
  tenantId: string;
  occurredAt: string;
}

export interface PayrollEntry {
  id: string;
  userId: string;
  userName: string;
  month: string;
  amount: number;
  bonusAmount?: number;
  deductionAmount?: number;
  allowanceAmount?: number;
  overtimeAmount?: number;
  taxDeductionAmount?: number;
  absenceDeductionAmount?: number;
  approvalStatus?: 'pending' | 'approved';
  approvedAt?: string;
  approvedBy?: string;
  approvedByName?: string;
  approvalHistory?: Array<{
    id: string;
    status: 'approved';
    approvedAt: string;
    approvedBy: string;
    approvedByName: string;
  }>;
  currency: CurrencyCode;
  status: 'pending' | 'partial' | 'paid';
  createdAt: string;
  paidAt?: string;
  paymentMethod?: PayrollPaymentMethod;
  transactionReference?: string;
  payments?: PayrollPayment[];
  adjustments?: PayrollAdjustment[];
}

export interface PayrollPayment {
  amount: number;
  method: PayrollPaymentMethod;
  paidAt: string;
  confirmed?: boolean;
  recordedBy?: string;
  recordedByName?: string;
  transactionReference?: string;
}

export interface PayrollAdjustment {
  id: string;
  kind: 'bonus' | 'deduction';
  amount: number;
  reason: string;
  createdAt: string;
  createdBy: string;
  createdByName: string;
}

export interface AttendanceRecord {
  id: string;
  userId: string;
  userName: string;
  date: string;
  status: 'present' | 'absent' | 'late' | 'half_day';
  checkInTime?: string;
  checkOutTime?: string;
  note: string;
  createdAt: string;
  createdBy: string;
}

export interface EmployeeSettings {
  annualLeaveAllowanceDays: number;
}

export interface LeaveRecord {
  id: string;
  userId: string;
  userName: string;
  startDate: string;
  endDate: string;
  leaveType: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  decisionAt?: string;
  decidedBy?: string;
  decidedByName?: string;
  createdAt: string;
  createdBy: string;
}

export interface AccountExpense {
  id: string;
  description: string;
  category: string;
  amount: number;
  currency: CurrencyCode;
  date: string;
  paymentMethod: PayrollPaymentMethod;
  createdBy: string;
  createdByName: string;
  accountId?: string;
  reconciled?: boolean;
  reconciledAt?: string;
  reconciledBy?: string;
  createdAt?: string;
}

export interface FinancialAccount {
  id: string;
  name: string;
  type: 'cash' | 'bank';
  bankName: string;
  currency: CurrencyCode;
  openingBalance: number;
  balance: number;
}

export interface FinancialTransaction {
  id: string;
  accountId: string;
  accountName: string;
  type: 'income' | 'expense';
  category: string;
  description: string;
  amount: number;
  currency: CurrencyCode;
  date: string;
  reference: string;
  reconciled: boolean;
  reconciledAt?: string;
  reconciledBy: string;
  adjustmentOf?: string;
  adjustmentReason: string;
  createdByName: string;
  createdAt: string;
}

export interface AccountFinanceData {
  currentBalances: Record<string, number>;
  financialAccounts: FinancialAccount[];
  financialTransactions: FinancialTransaction[];
  receivables: Record<string, number>;
  payables: Record<string, number>;
  sales: Array<{
    id: string;
    date: string;
    invoiceNumber: string;
    customerName: string;
    totalAmount: number;
    paidAmount: number;
    initialPaidAmount: number;
    outstandingBalance: number;
    costOfGoodsSold: number;
    currency: CurrencyCode;
    paymentStatus: PaymentStatus;
  }>;
  customerPayments: Array<{
    id: string;
    date: string;
    customerName: string;
    amount: number;
    currency: CurrencyCode;
    paymentMethod?: string;
    reference?: string;
  }>;
  purchases: Array<{
    id: string;
    date: string;
    purchaseNumber: string;
    supplierName: string;
    totalCost: number;
    paidAmount: number;
    outstandingBalance: number;
    currency: CurrencyCode;
  }>;
  supplierPayments: Array<{
    id: string;
    date: string;
    supplierName: string;
    amount: number;
    currency: CurrencyCode;
    paymentMethod?: string;
    reference?: string;
  }>;
  payroll: Array<{
    id: string;
    userName: string;
    month: string;
    amount: number;
    baseAmount: number;
    bonusAmount: number;
    deductionAmount: number;
    currency: CurrencyCode;
    status: PayrollEntry['status'];
    paidAt?: string;
    paymentMethod?: PayrollPaymentMethod;
    transactionReference?: string;
    payments?: PayrollPayment[];
  }>;
  expenses: AccountExpense[];
}

export interface BusinessSettings {
  businessName: string;
  ownerName: string;
  phone: string;
  email: string;
  address: string;
  registrationNumber: string;
  logoUrl: string;
  currency: CurrencyCode;
  taxRate: number; // e.g. 5%
  taxEnabled: boolean;
  goodsInsuranceRate: number;
  goodsInsuranceEnabled: boolean;
  receiptFooter: string;
  lowStockThresholdDefault: number;
  qrPrefix: string;
  supportWhatsApp: string;
}

export interface Product {
  id: string;
  name: string;
  nameSo?: string;
  sku: string;
  barcode: string;
  qrCode: string;
  category: string;
  categoryId?: string;
  brand: string;
  brandId?: string;
  purchaseCost: number;
  sellingPrice: number;
  wholesalePrice: number;
  stock: number;
  minStock: number;
  unit: UnitType;
  supplierId?: string;
  supplierName?: string;
  image?: string;
  description?: string;
  archived?: boolean;
  approvalStatus?: 'pending' | 'accepted' | 'rejected';
  submittedBy?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  createdAt: string;
}

export interface BrandRecord {
  id: string;
  name: string;
  code?: string;
  description: string;
  image: string;
  manufacturer?: string;
  website?: string;
  contactInformation?: string;
  status?: 'active' | 'inactive';
  createdAt: string;
  updatedAt?: string;
}

export interface CategoryRecord {
  id: string;
  name: string;
  code: string;
  description: string;
  image: string;
  parentCategoryId: string;
  status: 'active' | 'inactive';
  createdAt: string;
  updatedAt: string;
}

export type ProductApprovalStatus = 'pending' | 'accepted' | 'rejected';

export interface StockMovement {
  id: string;
  userId?: string;
  productId: string;
  productName: string;
  sku: string;
  type: StockMovementType;
  quantityDelta: number; // positive or negative
  previousStock: number;
  newStock: number;
  reason: string;
  date: string;
  userName: string;
  referenceId?: string; // invoice or purchase order ID
}

export interface Customer {
  id: string;
  customerId: string; // e.g. CUST-1001
  name: string;
  phone: string;
  email?: string;
  address: string;
  openingBalance: number;
  totalCredit: number; // total amount bought on credit
  totalPayments: number; // total payments made
  currentBalance: number; // openingBalance + totalCredit - totalPayments
  notes?: string;
  createdAt: string;
  status: 'active' | 'archived';
  creditLimit?: number;
}

export interface CustomerLedgerEntry {
  id: string;
  userId?: string;
  customerId: string;
  date: string;
  type: 'opening_balance' | 'credit_sale' | 'payment' | 'adjustment' | 'refund';
  amount: number;
  previousBalance: number;
  newBalance: number;
  reference?: string; // e.g. INV-2026-001 or REC-883
  paymentMethod?: PaymentMethod;
  notes?: string;
  cashierName: string;
}

export interface Supplier {
  id: string;
  supplierId: string;
  name: string;
  contactPerson: string;
  phone: string;
  email?: string;
  address: string;
  openingBalance: number;
  totalPurchases: number;
  totalPayments: number;
  currentBalance: number;
  notes?: string;
  createdAt: string;
  status: 'active' | 'archived';
}

export interface SupplierLedgerEntry {
  id: string;
  userId?: string;
  supplierId: string;
  date: string;
  type: 'opening_balance' | 'purchase' | 'payment' | 'adjustment' | 'return';
  amount: number;
  previousBalance: number;
  newBalance: number;
  reference?: string;
  paymentMethod?: string;
  notes?: string;
  userName: string;
}

export interface SaleItem {
  productId: string;
  productName: string;
  sku: string;
  unit: UnitType;
  quantity: number;
  unitCost: number; // for perpetual COGS
  unitPrice: number;
  discount: number;
  taxRate?: number;
  taxAmount?: number;
  total: number;
}

export interface SaleInvoice {
  id: string;
  invoiceNumber: string; // e.g. INV-1001
  date: string;
  customerId?: string;
  customerName: string;
  customerPhone?: string;
  cashierId: string;
  cashierName: string;
  items: SaleItem[];
  subtotal: number;
  discount: number;
  tax: number;
  goodsInsurance?: number;
  totalAmount: number;
  paidAmount: number;
  outstandingBalance: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  notes?: string;
  heldOrderId?: string;
  holdReference?: string;
  tableName?: string;
  branchName?: string;
  qrIdentifier: string;
  currency: CurrencyCode;
}

export interface BusinessTeamSale {
  id: string;
  invoiceNumber: string;
  date: string;
  cashierId: string;
  cashierName: string;
  cashierRole: RoleType;
  items: Array<{ productName: string; quantity: number }>;
  totalAmount: number;
  paymentStatus: PaymentStatus;
  currency: CurrencyCode;
}

export interface BusinessTeamSalesSummary {
  id: string;
  name: string;
  role: RoleType;
  salesCount: number;
  totals: Array<{ currency: CurrencyCode; amount: number }>;
}

export interface PlatformBusiness {
  tenantId: string;
  businessName: string;
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string;
  userCount: number;
  activeUserCount: number;
  plan: {
    id: string;
    name: string;
    status: string;
    isActive: boolean;
    activationDate: string;
    expiryDate: string;
  } | null;
  pendingPaymentRequest: PlatformLicenseRequest | null;
  rejectedPaymentRequest: PlatformLicenseVerification | null;
  payments: Array<{
    requestId: string;
    planName: string;
    planId: string;
    priceUSD: number;
    trxId: string;
    submittedAt: string;
    approvedAt: string;
  }>;
  verificationHistory: PlatformLicenseVerification[];
  totalPaidUSD: number;
  salesCount: number;
  salesTotals: Array<{ currency: CurrencyCode; amount: number }>;
  currency: CurrencyCode;
}

export interface PlatformLicenseRequest {
  requestId: string;
  planId: string;
  planName: string;
  priceUSD: number;
  trxId: string;
  submittedAt: string;
}

export interface PlatformLicenseVerification extends PlatformLicenseRequest {
  decidedAt: string;
  status: 'approved' | 'rejected' | 'pending';
  decidedBy: string;
}

export interface PlatformDashboardData {
  businesses: PlatformBusiness[];
}

export interface PlatformLicenseAuditEvent {
  id: string;
  tenantId: string;
  actorId: string;
  actorName: string;
  action: string;
  requestId: string;
  occurredAt: string;
  details: Record<string, unknown>;
}

export interface SubscriptionPlanSettings {
  id: string;
  name: string;
  priceUSD: number;
  durationDays: number;
  userLimit: number | null;
  productLimit: number | null;
  billingPeriod: 'trial' | 'monthly' | 'yearly' | 'lifetime';
  enabled: boolean;
}

export interface PurchaseItem {
  productId: string;
  productName: string;
  sku: string;
  quantity: number;
  unitCost: number;
  total: number;
}

export interface PurchaseInvoice {
  id: string;
  userId?: string;
  purchaseNumber: string; // e.g. PO-5001
  supplierId: string;
  supplierName: string;
  date: string;
  items: PurchaseItem[];
  totalCost: number;
  paidAmount: number;
  outstandingBalance: number;
  paymentStatus: PaymentStatus;
  paymentMethod?: string;
  received: boolean;
  notes?: string;
  userName: string;
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  nameSo: string;
  priceUSD: number;
  billingPeriod: 'monthly' | 'quarterly' | 'semiannual' | 'yearly' | 'lifetime';
  description: string;
  userLimit: string;
  productLimit: string;
  features: string[];
  featuresSo: string[];
  isCurrent?: boolean;
  badge?: string;
  popular?: boolean;
  ussdCode?: string;
}

export interface ServerLicenseState {
  isActive: boolean;
  isLocked: boolean;
  lockedReason?: string;
  licenseKey: string;
  planId: string;
  planName: string;
  activationDate: string;
  expiryDate: string;
  totalDays: number;
  currentDay: number;
  daysRemaining: number;
  hoursRemaining: number;
  secondsRemaining: number;
  serverTimestamp: string;
  userLimit?: number | null;
  productLimit?: number | null;
  status: 'ACTIVE' | 'EXPIRED' | 'TRIAL' | 'LOCKED' | 'SUSPENDED';
  ussdPhone: string;
  activeUssdCode: string;
  lastTrxId?: string;
  usedTrxIds?: string[];
  countdownExtendedAt?: string;
  pendingPaymentRequest?: {
    requestId: string;
    planId: string;
    planName: string;
    priceUSD: number;
    durationDays: number;
    trxId: string;
    submittedAt: string;
    submittedBy: string;
    status: 'pending' | 'approved' | 'rejected';
    approvedAt?: string;
    rejectedAt?: string;
  };
}
