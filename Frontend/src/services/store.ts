import {
  Product,
  Customer,
  Supplier,
  SaleInvoice,
  PurchaseInvoice,
  StockMovement,
  CustomerLedgerEntry,
  SupplierLedgerEntry,
  BusinessSettings,
  SubscriptionPlan,
  User,
  PayrollEntry,
  AttendanceRecord,
  EmployeeSettings,
  LeaveRecord,
  CurrencyCode,
  ServerLicenseState,
  BrandRecord,
  CategoryRecord,
} from '../types';
import {
  getStoredAccessToken,
  getWorkspace,
  getWorkspaceLicense,
  initializeWorkspace,
  moveWorkspaceRecordToRecyclingBin,
  saveWorkspaceValue,
} from './api';
import { getPlanLimits, TRIAL_DURATION_DAYS } from './licenseLimits';
import { isBusinessAdministratorRole } from './permissions';

const STORAGE_KEY_PREFIX = 'maqsuud_pos_v4_clean_';
const DAY_IN_SECONDS = 24 * 60 * 60;
let serverClockAnchor = {
  serverTime: Date.now(),
  monotonicTime: performance.now(),
  synchronized: false,
};
const SHARED_WORKSPACE_KEYS = [
  'server_license',
] as const;
const PRIVATE_WORKSPACE_KEYS = [
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
] as const;
const REMOVABLE_DEMO_PRODUCT_IDS = new Set([
  'catalog-v2-macbook-air-13',
  'catalog-v2-dell-inspiron-15',
  'catalog-v2-hp-elitebook-840',
  'catalog-v2-lenovo-thinkpad-e14',
  'catalog-v2-iphone-15-128',
  'catalog-v2-iphone-16-128',
  'catalog-v2-iphone-16-pro-256',
  'catalog-v2-iphone-16-pro-max-256',
]);
const catalogCode = (prefix: string, value: string): string => {
  const slug = value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 36);
  return `${prefix}-${slug || 'ITEM'}`;
};
const catalogRecordId = (prefix: string, name: string): string => {
  let hash = 2166136261;
  for (const char of name.toLocaleLowerCase()) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `${prefix}-${(hash >>> 0).toString(16)}`;
};
const ACTIVE_WORKSPACE_USER_KEY = `${STORAGE_KEY_PREFIX}activeWorkspaceUserId`;
let workspaceWritesEnabled = false;
let activeWorkspaceUserId: string | null = null;

function getActiveWorkspaceId(): string | null {
  if (activeWorkspaceUserId) return activeWorkspaceUserId;
  try {
    return sessionStorage.getItem(ACTIVE_WORKSPACE_USER_KEY);
  } catch (error) {
    console.error('Unable to read the active workspace account:', error);
    return null;
  }
}

function getStorageKey(key: string): string {
  const isPrivateKey = (PRIVATE_WORKSPACE_KEYS as readonly string[]).includes(key);
  const ownerId = isPrivateKey ? getActiveWorkspaceId() : null;
  return `${STORAGE_KEY_PREFIX}${ownerId ? `private_${ownerId}_` : ''}${key}`;
}

function getStoredRaw<T>(key: string, defaultValue: T): T {
  try {
    const item = localStorage.getItem(`${STORAGE_KEY_PREFIX}${key}`);
    return item ? JSON.parse(item) : defaultValue;
  } catch {
    return defaultValue;
  }
}

function setStoredRaw<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key.startsWith(STORAGE_KEY_PREFIX) ? key : `${STORAGE_KEY_PREFIX}${key}`, JSON.stringify(value));
  } catch (error) {
    console.error('Storage save error:', error);
  }
}

const parseLicenseTimestamp = (value: string): number => {
  const normalized = value.trim().replace(' ', 'T');
  const hasTimezone = /(?:Z|[+-]\d{2}:\d{2})$/i.test(normalized);
  return new Date(hasTimezone ? normalized : `${normalized}Z`).getTime();
};

function getEstimatedServerTime(): number {
  return serverClockAnchor.synchronized
    ? serverClockAnchor.serverTime + performance.now() - serverClockAnchor.monotonicTime
    : Date.now();
}

function synchronizeServerTime(license: ServerLicenseState): void {
  const serverTime = Date.parse(license.serverTimestamp);
  if (!Number.isFinite(serverTime)) return;
  serverClockAnchor = {
    serverTime,
    monotonicTime: performance.now(),
    synchronized: true,
  };
}

function isServerLicenseState(value: unknown): value is ServerLicenseState {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const license = value as Record<string, unknown>;
  return typeof license.isActive === 'boolean' &&
    typeof license.isLocked === 'boolean' &&
    typeof license.planId === 'string' &&
    typeof license.expiryDate === 'string';
}

const formatLicenseTimestamp = (value: Date): string =>
  value.toISOString().replace('T', ' ').substring(0, 19);

export const CURRENCY_SYMBOLS: Record<string, { symbol: string; rateAgainstUSD: number; name: string }> = {
  USD: { symbol: '$', rateAgainstUSD: 1, name: 'US Dollar' },
  SOS: { symbol: 'SSh', rateAgainstUSD: 26000, name: 'Somali Shilling' },
  KES: { symbol: 'KSh', rateAgainstUSD: 135, name: 'Kenyan Shilling' },
  SLSH: { symbol: 'SlSh', rateAgainstUSD: 8500, name: 'Somaliland Shilling' },
  ETB: { symbol: 'Br', rateAgainstUSD: 120, name: 'Ethiopian Birr' },
  DJF: { symbol: 'Fdj', rateAgainstUSD: 178, name: 'Djiboutian Franc' },
};

const INITIAL_SETTINGS: BusinessSettings = {
  businessName: 'Safi Sali Companies',
  ownerName: '',
  phone: '',
  email: '',
  address: '',
  registrationNumber: '',
  logoUrl: '',
  currency: 'USD',
  taxRate: 0.05,
  taxEnabled: true,
  goodsInsuranceRate: 1,
  goodsInsuranceEnabled: false,
  receiptFooter: 'Mahadsanid! Waad ku mahadsantahay doorashada Safi Sali Companies.',
  lowStockThresholdDefault: 0,
  qrPrefix: 'MQ-ICT',
  supportWhatsApp: 'https://wa.me/252683723015',
};

const INITIAL_USERS: User[] = [
  {
    id: 'usr-1',
    name: 'Abdullahi (Admin)',
    email: 'admin@example.com',
    role: 'admin',
    phone: '+252 61 3078734',
    active: true,
    createdAt: '2026-01-10',
  },
  {
    id: 'usr-2',
    name: 'Hassan Ali (Manager)',
    email: 'manager@example.com',
    role: 'manager',
    phone: '+252 61 5551234',
    active: true,
    createdAt: '2026-01-15',
  },
  {
    id: 'usr-3',
    name: 'Faadumo Yusuf (Cashier)',
    email: 'cashier@example.com',
    role: 'cashier',
    phone: '+252 61 7779876',
    active: true,
    createdAt: '2026-02-01',
  },
  {
    id: 'usr-4',
    name: 'Jamaal Shire (Accountant)',
    email: 'accountant@example.com',
    role: 'accountant',
    phone: '+252 61 8883344',
    active: true,
    createdAt: '2026-02-05',
  },
];

export const INITIAL_CUSTOMERS: Customer[] = [
  {
    id: 'cust-1',
    customerId: 'CUST-1001',
    name: 'Guuleed Maxamed Xasan',
    phone: '+252 61 5882314',
    address: 'Wadajir District, Mogadishu',
    openingBalance: 0,
    totalCredit: 450,
    totalPayments: 150,
    currentBalance: 300,
    createdAt: '2026-02-01',
    status: 'active',
    creditLimit: 1000,
  },
  {
    id: 'cust-2',
    customerId: 'CUST-1002',
    name: 'Maryan Axmed Cali',
    phone: '+252 61 7234901',
    address: 'Hodan District, Mogadishu',
    openingBalance: 0,
    totalCredit: 820,
    totalPayments: 500,
    currentBalance: 320,
    createdAt: '2026-02-03',
    status: 'active',
    creditLimit: 1500,
  },
  {
    id: 'cust-3',
    customerId: 'CUST-1003',
    name: 'Shirkadda Hormuud Telecom Substation',
    phone: '+252 61 9002134',
    address: 'Bakaaro Market, Mogadishu',
    openingBalance: 0,
    totalCredit: 1250,
    totalPayments: 1250,
    currentBalance: 0,
    createdAt: '2026-02-05',
    status: 'active',
    creditLimit: 5000,
  },
  {
    id: 'cust-4',
    customerId: 'CUST-1004',
    name: 'Cabdiweli Jaamac Nuur',
    phone: '+252 61 4455667',
    address: 'KM4 Maka Al-Mukarama, Mogadishu',
    openingBalance: 120,
    totalCredit: 280,
    totalPayments: 200,
    currentBalance: 200,
    createdAt: '2026-02-08',
    status: 'active',
    creditLimit: 800,
  },
];

export const INITIAL_SUPPLIERS: Supplier[] = [
  {
    id: 'sup-1',
    supplierId: 'SUPP-2001',
    name: 'Dubai Electronics & IT Distribution LLC',
    contactPerson: 'Tariq Al-Hashimi',
    phone: '+971 50 1234567',
    address: 'Deira, Dubai, UAE',
    openingBalance: 0,
    totalPurchases: 8500,
    totalPayments: 6000,
    currentBalance: 2500,
    createdAt: '2026-01-15',
    status: 'active',
  },
  {
    id: 'sup-2',
    supplierId: 'SUPP-2002',
    name: 'Al-Nuur Wholesale Hardware & Networking',
    contactPerson: 'Nuuradiin Cali',
    phone: '+252 61 2233445',
    address: 'Bakaaro Market, Mogadishu',
    openingBalance: 0,
    totalPurchases: 4200,
    totalPayments: 4200,
    currentBalance: 0,
    createdAt: '2026-01-20',
    status: 'active',
  },
  {
    id: 'sup-3',
    supplierId: 'SUPP-2003',
    name: 'Barwaaqo Mobile Distributors',
    contactPerson: 'Maxamed Shire',
    phone: '+252 61 8899001',
    address: 'Suuq Bacaad, Mogadishu',
    openingBalance: 0,
    totalPurchases: 6800,
    totalPayments: 5100,
    currentBalance: 1700,
    createdAt: '2026-02-01',
    status: 'active',
  },
];

export const INITIAL_SALES: SaleInvoice[] = [
  {
    id: 'inv-101',
    invoiceNumber: 'INV-2026-1001',
    date: '2026-10-19 14:30',
    customerId: 'cust-1',
    customerName: 'Guuleed Maxamed Xasan',
    customerPhone: '+252 61 5882314',
    cashierId: 'usr-3',
    cashierName: 'Faadumo Yusuf (Cashier)',
    items: [
      {
        productId: 'prod-1',
        productName: 'Apple iPhone 15 Pro Max 256GB Titanium',
        sku: 'MQ-IPH15PM',
        unit: 'piece',
        quantity: 1,
        unitCost: 980,
        unitPrice: 1150,
        discount: 0,
        total: 1150,
      },
    ],
    subtotal: 1150,
    discount: 0,
    tax: 0,
    totalAmount: 1150,
    paidAmount: 700,
    outstandingBalance: 450,
    paymentMethod: 'deyn',
    paymentStatus: 'partial',
    notes: 'Partial payment made via EVC Plus, balance entered as Deyn',
    qrIdentifier: 'INV-2026-1001',
    currency: 'USD',
  },
  {
    id: 'inv-102',
    invoiceNumber: 'INV-2026-1002',
    date: '2026-10-19 16:15',
    customerId: 'cust-2',
    customerName: 'Maryan Axmed Cali',
    customerPhone: '+252 61 7234901',
    cashierId: 'usr-3',
    cashierName: 'Faadumo Yusuf (Cashier)',
    items: [
      {
        productId: 'prod-3',
        productName: 'Ubiquiti UniFi 6 Pro WiFi Access Point',
        sku: 'MQ-U6PRO',
        unit: 'piece',
        quantity: 2,
        unitCost: 135,
        unitPrice: 175,
        discount: 0,
        total: 350,
      },
    ],
    subtotal: 350,
    discount: 0,
    tax: 0,
    totalAmount: 350,
    paidAmount: 350,
    outstandingBalance: 0,
    paymentMethod: 'evc_plus',
    paymentStatus: 'paid',
    notes: 'Paid via EVC Plus',
    qrIdentifier: 'INV-2026-1002',
    currency: 'USD',
  },
];

export const INITIAL_CATEGORIES: string[] = [];

export const INITIAL_PLANS: SubscriptionPlan[] = [
  {
    id: 'plan-trial',
    name: '365-Day Free Trial',
    nameSo: 'Qorshaha Bilaashka ah',
    priceUSD: 0,
    billingPeriod: 'monthly',
    description: 'Free 365-day starter access for single-shop micro retailers to try the POS.',
    userLimit: '3 Users',
    productLimit: '500 Products',
    features: ['Basic POS checkout', 'Up to 3 users', 'Up to 500 Products', 'Cash Sales only', 'Standard Receipts', '365-Day Free Trial', 'Automatic License Expiration'],
    featuresSo: ['Iibka POS aasaasiga ah', 'Ilaa 50 badeeco', 'Iib lacag caddaan ah', 'Rasiidhada caadiga ah', 'Tijaabo bilaash ah oo 365 maalmood ah', 'Ruqsaddu si otomaatig ah ayay u dhacaysaa'],
    badge: '365-Day Free Trial',
    ussdCode: '',
  },
  {
    id: 'plan-basic',
    name: 'Basic Retail Plan',
    nameSo: 'Qorshaha Tafaariiqda Aasaasiga ah',
    priceUSD: 3,
    billingPeriod: 'monthly',
    description: 'For established single-location retail shops and small supermarkets.',
    userLimit: '3 Users',
    productLimit: '500 Products',
    features: ['Full POS & QR Scanner', 'Customer Debts & Ledger', 'Supplier Tracking', 'Thermal Receipt Printing', 'PDF & Excel Reports', 'Email Support'],
    featuresSo: ['POS buuxa iyo QR Scanner', 'Deymaha macaamiisha iyo ledger', 'Raadraaca alaab-qeybiyeyaasha', 'Daabacaadda rasiidhada', 'Warbixinnada PDF iyo Excel', 'Taageerada email-ka'],
    badge: '$3 / Month',
    ussdCode: '*712*683723015*3#',
  },
  {
    id: 'plan-professional',
    name: 'Professional Business Plan',
    nameSo: 'Qorshaha Ganacsiga Xirfadeed',
    priceUSD: 5,
    billingPeriod: 'monthly',
    description: 'For busy wholesalers, IT shops, and growing businesses.',
    userLimit: '10 Users',
    productLimit: 'Unlimited Products',
    features: ['Unlimited Products & Invoices', 'Full Ledger & Rasiid Receipts', 'Cost of Goods Sold (COGS)', 'Multi-currency & Somali language', 'Inventory Alerts', 'Audit Logging & Role-Based Access Control', 'Priority 24/7 Support'],
    featuresSo: ['Badeecooyin iyo invoices aan xad lahayn', 'Ledger buuxa iyo rasiidhada Rasiid', 'Xisaabinta COGS', 'Lacagaha kala duwan iyo Af-Soomaali', 'Digniinaha kaydka', 'Audit iyo xakamaynta rukhsadaha', 'Taageero mudnaan leh 24/7'],
    popular: true,
    badge: '$5 / Month',
    ussdCode: '*712*683723015*5#',
  },
  {
    id: 'plan-enterprise',
    name: 'Enterprise Wholesaler Plan',
    nameSo: 'Qorshaha Jumladleyda Enterprise',
    priceUSD: 30,
    billingPeriod: 'monthly',
    description: 'For multi-warehouse and high-volume operations.',
    userLimit: 'Unlimited Users',
    productLimit: 'Unlimited Products',
    features: ['Everything in Professional', 'Unlimited Staff Accounts', 'Custom Roles & Fine Permissions', 'Automated Daily Data Sync', 'Dedicated Account Manager'],
    featuresSo: ['Dhammaan waxyaabaha Professional', 'Akoonno shaqaale aan xad lahayn', 'Roles iyo rukhsado gaar ah', 'Is-waafajin xog maalinle ah', 'Maamule akoon gaar ah'],
    badge: '$30 / Month',
    ussdCode: '*712*683723015*30#',
  },
  {
    id: 'plan-annual',
    name: 'Annual Enterprise Plan',
    nameSo: 'Qorshaha Enterprise Sanadlaha ah',
    priceUSD: 360,
    billingPeriod: 'yearly',
    description: 'Full-year enterprise licensing for teams that need complete retail control.',
    userLimit: 'Unlimited Users',
    productLimit: 'Unlimited Products',
    features: ['All Professional & Enterprise Features', 'Unlimited Products, Categories & Invoices', 'Unlimited Staff Accounts & Operator Roles', 'Full Multi-Currency Ledger', 'USD, SOS, SLSH, KES & ETB Support', 'Automated Database Backups & Cloud Sync', 'Advanced Reports & Business Analytics', 'VIP Technical Support', 'Thermal Printer & POS Hardware Integration', '365-Day Enterprise License'],
    featuresSo: ['Dhammaan adeegyada Professional iyo Enterprise', 'Badeecooyin, qaybo iyo invoices aan xad lahayn', 'Shaqaale iyo operator roles aan xad lahayn', 'Ledger lacagaha kala duwan', 'Taageerada USD, SOS, SLSH, KES iyo ETB', 'Kaydinta xogta iyo Cloud Sync', 'Warbixinno iyo falanqayn ganacsi', 'Taageero farsamo VIP', 'Isku-xirka printer-ka iyo qalabka POS', 'Ruqsad 365 maalmood ah'],
    badge: '365-Day License',
    ussdCode: '*712*683723015*360#',
  },
  {
    id: 'plan-lifetime',
    name: 'Lifetime Enterprise Plan',
    nameSo: 'Helitaanka Enterprise ee Joogtada ah',
    priceUSD: 7000,
    billingPeriod: 'lifetime',
    description: 'One-time investment for permanent, unrestricted access to Safi Sali Companies.',
    userLimit: 'Unlimited Users',
    productLimit: 'Unlimited Products',
    features: ['Lifetime License', 'Unlimited Users & Products', 'Full POS & Inventory Management', 'Advanced Accounting & Financial Ledger', 'Multi-Currency Support', 'Unlimited Categories & Invoices', 'Advanced Reporting & Analytics', 'Enterprise-Level Access Controls', 'Database Backup & Cloud Sync (service availability applies)', 'Dedicated Safi Sali Companies Support', 'Business-Grade POS & Thermal Printer Integration'],
    featuresSo: ['Ruqsad joogto ah', 'Isticmaalayaal iyo badeecooyin aan xad lahayn', 'Maamulka POS iyo kaydka', 'Xisaabinta iyo ledger maaliyadeed oo horumarsan', 'Taageerada lacagaha kala duwan', 'Qaybo iyo invoices aan xad lahayn', 'Warbixinno iyo falanqayn horumarsan', 'Xakamaynta gelitaanka heer Enterprise', 'Kaydinta xogta iyo Cloud Sync (waxay ku xiran tahay adeegga)', 'Taageerada Safi Sali Companies', 'Isku-xirka POS iyo daabacaha thermal'],
    badge: '$7,000 Lifetime',
    ussdCode: '*712*683723015*7000#',
  },
];

const initialTrialActivation = new Date();
const initialTrialExpiry = new Date(initialTrialActivation.getTime() + TRIAL_DURATION_DAYS * DAY_IN_SECONDS * 1000);

const INITIAL_LICENSE_STATE: ServerLicenseState = {
  isActive: true,
  isLocked: false,
  lockedReason: '',
  licenseKey: 'MQ-TRIAL-365D',
  planId: 'plan-trial',
  planName: '365-Day Free Trial',
  activationDate: initialTrialActivation.toISOString().replace('T', ' ').substring(0, 19),
  expiryDate: initialTrialExpiry.toISOString().replace('T', ' ').substring(0, 19),
  totalDays: TRIAL_DURATION_DAYS,
  currentDay: 1,
  daysRemaining: TRIAL_DURATION_DAYS,
  hoursRemaining: TRIAL_DURATION_DAYS * 24,
  secondsRemaining: TRIAL_DURATION_DAYS * DAY_IN_SECONDS,
  serverTimestamp: initialTrialActivation.toISOString(),
  status: 'ACTIVE' as const,
  ussdPhone: '683723015',
  activeUssdCode: '',
  lastTrxId: undefined,
};

function getStored<T>(key: string, defaultValue: T): T {
  try {
    const item = localStorage.getItem(getStorageKey(key));
    return item ? JSON.parse(item) : defaultValue;
  } catch {
    return defaultValue;
  }
}

function setStored<T>(key: string, value: T, persistRemote = true): Promise<void> {
  try {
    localStorage.setItem(getStorageKey(key), JSON.stringify(value));
  } catch (e) {
    console.error('Storage save error:', e);
  }
  const token = getStoredAccessToken();
  const isWorkspaceKey =
    (SHARED_WORKSPACE_KEYS as readonly string[]).includes(key) ||
    (PRIVATE_WORKSPACE_KEYS as readonly string[]).includes(key);
  if (!persistRemote || !workspaceWritesEnabled || !token || !isWorkspaceKey) return Promise.resolve();
  const save = saveWorkspaceValue(token, key, value);
  void save.catch((error: Error) => {
    console.error(`Unable to save ${key} to the secure workspace:`, error);
    window.dispatchEvent(new CustomEvent('workspace-save-error', { detail: error.message }));
  });
  return save;
}

type Listener = () => void;
const listeners: Set<Listener> = new Set();

function notifyListeners() {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch (e) {
      console.error('Store listener error:', e);
    }
  });
}

export const AppStore = {
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  // Server License & Security Lock System
  getServerLicense(): ServerLicenseState {
    let license = getStored<ServerLicenseState>('server_license', INITIAL_LICENSE_STATE);
    if (!serverClockAnchor.synchronized) synchronizeServerTime(license);
    if (license.planId === 'plan-trial') {
      const activationTime = parseLicenseTimestamp(license.activationDate);
      if (Number.isFinite(activationTime)) {
        const expiryDate = formatLicenseTimestamp(
          new Date(activationTime + TRIAL_DURATION_DAYS * DAY_IN_SECONDS * 1000)
        );
        const normalizedTrial = {
          ...license,
          licenseKey: 'MQ-TRIAL-365D',
          planName: '365-Day Free Trial',
          totalDays: TRIAL_DURATION_DAYS,
          expiryDate,
          countdownExtendedAt: undefined,
        };
        if (
          license.licenseKey !== normalizedTrial.licenseKey ||
          license.planName !== normalizedTrial.planName ||
          license.totalDays !== normalizedTrial.totalDays ||
          license.expiryDate !== expiryDate ||
          license.countdownExtendedAt
        ) {
          license = normalizedTrial;
          setStoredRaw(getStorageKey('server_license'), license);
        }
      }
    }
    const legacyPrices: Record<string, { price: number; name: string }> = {
      'plan-pro': { price: 5, name: 'Monthly Plan' },
      'plan-annual': { price: 360, name: 'Annual Enterprise Plan' },
    };
    const legacyPlan = legacyPrices[license.planId];
    const activeUssdCode = license.activeUssdCode || '';
    if (legacyPlan && (activeUssdCode.endsWith('*30#') || activeUssdCode.endsWith('*360#'))) {
      const normalized = {
        ...license,
        planName: `${legacyPlan.name} ($${legacyPlan.price})`,
        activeUssdCode: `*712*683723015*${legacyPlan.price}#`,
        ussdPhone: '683723015',
      };
      license = normalized;
      setStoredRaw(getStorageKey('server_license'), license);
    }

    const isLifetime = license.planId === 'plan-lifetime';
    const expiryTime = parseLicenseTimestamp(license.expiryDate);
    const now = getEstimatedServerTime();
    const isExpired = !isLifetime && (!Number.isFinite(expiryTime) || expiryTime <= now);
    const remainingSeconds = isLifetime || !Number.isFinite(expiryTime)
      ? 0
      : Math.max(0, Math.ceil((expiryTime - now) / 1000));
    const activationTime = parseLicenseTimestamp(license.activationDate);
    const elapsedDays = Number.isFinite(activationTime)
      ? Math.max(0, Math.floor((now - activationTime) / (DAY_IN_SECONDS * 1000)))
      : 0;
    const currentDay = isLifetime
      ? 0
      : Math.min(Math.max(1, license.totalDays), elapsedDays + 1);
    const normalized = {
      ...license,
      isActive: !isExpired && !license.isLocked,
      isLocked: isExpired || license.isLocked,
      lockedReason: isExpired ? 'License expired' : license.lockedReason || '',
      status: isExpired
        ? 'EXPIRED' as const
        : license.status === 'SUSPENDED'
          ? 'SUSPENDED' as const
          : license.isLocked ? 'LOCKED' as const : 'ACTIVE' as const,
      currentDay,
      daysRemaining: isLifetime ? 0 : Math.ceil(remainingSeconds / 86400),
      hoursRemaining: Math.floor(remainingSeconds / 3600),
      secondsRemaining: remainingSeconds,
    };
    if (isExpired && (!license.isLocked || license.status !== 'EXPIRED' || license.isActive)) {
      setStoredRaw(getStorageKey('server_license'), normalized);
    }
    return normalized;
  },

  setServerLicense(license: ServerLicenseState): ServerLicenseState {
    synchronizeServerTime(license);
    setStoredRaw(getStorageKey('server_license'), license);
    notifyListeners();
    return license;
  },

  async refreshServerLicense(): Promise<ServerLicenseState> {
    const token = getStoredAccessToken();
    if (!token) throw new Error('Please sign in again to check the license status.');
    const license = await getWorkspaceLicense(token);
    if (!isServerLicenseState(license)) {
      throw new Error('The server did not return a license status.');
    }
    return this.setServerLicense(license);
  },

  // Settings
  getSettings(): BusinessSettings {
    return { ...INITIAL_SETTINGS, ...getStored<Partial<BusinessSettings>>('settings', {}) };
  },

  getPayrollEntries(): PayrollEntry[] {
    return getStored<PayrollEntry[]>('payroll', []);
  },

  getAttendanceRecords(): AttendanceRecord[] {
    return getStored<AttendanceRecord[]>('attendance', []);
  },

  getEmployeeSettings(): EmployeeSettings {
    return {
      annualLeaveAllowanceDays: 21,
      ...getStored<Partial<EmployeeSettings>>('employee_settings', {}),
    };
  },

  async saveEmployeeSettings(settings: EmployeeSettings): Promise<void> {
    const token = getStoredAccessToken();
    if (!token || !workspaceWritesEnabled) {
      throw new Error('Your secure session is not ready. Please sign in again.');
    }
    await saveWorkspaceValue(token, 'employee_settings', settings);
    setStoredRaw(getStorageKey('employee_settings'), settings);
    notifyListeners();
  },

  async saveAttendanceRecords(records: AttendanceRecord[]): Promise<void> {
    const token = getStoredAccessToken();
    if (!token || !workspaceWritesEnabled) {
      throw new Error('Your secure session is not ready. Please sign in again.');
    }
    await saveWorkspaceValue(token, 'attendance', records);
    setStoredRaw(getStorageKey('attendance'), records);
    notifyListeners();
  },

  getLeaveRecords(): LeaveRecord[] {
    return getStored<LeaveRecord[]>('leave_records', []);
  },

  async saveLeaveRecords(records: LeaveRecord[]): Promise<void> {
    const token = getStoredAccessToken();
    if (!token || !workspaceWritesEnabled) {
      throw new Error('Your secure session is not ready. Please sign in again.');
    }
    await saveWorkspaceValue(token, 'leave_records', records);
    setStoredRaw(getStorageKey('leave_records'), records);
    notifyListeners();
  },

  async savePayrollEntries(entries: PayrollEntry[]): Promise<void> {
    const token = getStoredAccessToken();
    if (!token || !workspaceWritesEnabled) {
      throw new Error('Your secure session is not ready. Please sign in again.');
    }
    await saveWorkspaceValue(token, 'payroll', entries);
    setStoredRaw(getStorageKey('payroll'), entries);
    notifyListeners();
  },

  saveSettings(newSettings: BusinessSettings) {
    setStored('settings', newSettings);
    notifyListeners();
  },

  // Users & Active Role
  getUsers(): User[] {
    return getStored<User[]>('users', INITIAL_USERS);
  },

  getActiveUser(): User {
    const defaultUser = INITIAL_USERS[0];
    const user = activeWorkspaceUserId
      ? getStoredRaw<User>(`activeUser_${activeWorkspaceUserId}`, defaultUser)
      : defaultUser;
    if (user && user.name && user.name.toLowerCase().includes('sharma')) {
      user.name = 'Abdullahi (Admin)';
      if (activeWorkspaceUserId) {
        setStoredRaw(`activeUser_${activeWorkspaceUserId}`, user);
      }
    }
    return user;
  },

  setActiveUser(user: User) {
    activeWorkspaceUserId = user.id;
    sessionStorage.setItem(ACTIVE_WORKSPACE_USER_KEY, user.id);
    setStoredRaw(`activeUser_${user.id}`, user);
    notifyListeners();
  },

  async loadWorkspace(user: User, token: string): Promise<void> {
    workspaceWritesEnabled = false;
    activeWorkspaceUserId = user.id;
    sessionStorage.setItem(ACTIVE_WORKSPACE_USER_KEY, user.id);
    setStoredRaw(`activeUser_${user.id}`, user);

    let workspace = await getWorkspace(token);
    if (!workspace.initialized) {
      if (user.role !== 'admin') {
        throw new Error('The business workspace has not been initialized by an administrator.');
      }
      const shared = Object.fromEntries(
        SHARED_WORKSPACE_KEYS.map((key) => [key, this.getServerLicense()])
      );
      const privateData = Object.fromEntries(
        PRIVATE_WORKSPACE_KEYS.map((key) => [
          key,
          key === 'settings' || key === 'category_descriptions' || key === 'employee_settings' ? {} : [],
        ])
      );
      await initializeWorkspace(token, shared, privateData);
      workspace = await getWorkspace(token);
    }

    for (const [key, value] of Object.entries(workspace.shared)) {
      if ((SHARED_WORKSPACE_KEYS as readonly string[]).includes(key)) {
        if (key === 'server_license' && isServerLicenseState(value)) {
          this.setServerLicense(value);
        } else {
          setStoredRaw(key, value);
        }
      }
    }
    for (const [key, value] of Object.entries(workspace.private)) {
      if ((PRIVATE_WORKSPACE_KEYS as readonly string[]).includes(key)) {
        setStoredRaw(getStorageKey(key), value);
      }
    }
    for (const key of PRIVATE_WORKSPACE_KEYS) {
      if (!(key in workspace.private)) {
        setStoredRaw(
          getStorageKey(key),
          key === 'settings' || key === 'category_descriptions' || key === 'employee_settings' ? {} : []
        );
      }
    }

    const storedProducts = Array.isArray(workspace.private.products)
      ? workspace.private.products as Product[]
      : [];
    const remainingProducts = storedProducts.filter((product) => !REMOVABLE_DEMO_PRODUCT_IDS.has(product.id));
    if (remainingProducts.length !== storedProducts.length) {
      const stockMovements = Array.isArray(workspace.private.stock_movements)
        ? workspace.private.stock_movements as StockMovement[]
        : [];
      const remainingMovements = stockMovements.filter((movement) =>
        !REMOVABLE_DEMO_PRODUCT_IDS.has(movement.productId)
      );
      const categories = Array.isArray(workspace.private.categories)
        ? workspace.private.categories as string[]
        : [];
      const remainingCategories = categories.filter((category) =>
        !['computers', 'iphones'].includes(category.toLowerCase()) ||
        remainingProducts.some((product) => (product.category || '').toLowerCase() === category.toLowerCase())
      );

      setStoredRaw(getStorageKey('products'), remainingProducts);
      setStoredRaw(getStorageKey('stock_movements'), remainingMovements);
      setStoredRaw(getStorageKey('categories'), remainingCategories);
      await Promise.all([
        saveWorkspaceValue(token, 'products', remainingProducts),
        saveWorkspaceValue(token, 'stock_movements', remainingMovements),
        saveWorkspaceValue(token, 'categories', remainingCategories),
      ]);
    }

    workspaceWritesEnabled = true;
    notifyListeners();
  },

  clearWorkspaceCache(): void {
    workspaceWritesEnabled = false;
    const ownerId = getActiveWorkspaceId();
    activeWorkspaceUserId = null;
    sessionStorage.removeItem(ACTIVE_WORKSPACE_USER_KEY);
    if (ownerId) {
      const userPrefix = `${STORAGE_KEY_PREFIX}private_${ownerId}_`;
      const keysToRemove: string[] = [];
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (key?.startsWith(userPrefix)) keysToRemove.push(key);
      }
      keysToRemove.forEach((key) => localStorage.removeItem(key));
      localStorage.removeItem(`${STORAGE_KEY_PREFIX}activeUser_${ownerId}`);
    }
    localStorage.removeItem(`${STORAGE_KEY_PREFIX}activeUser`);
  },

  addUser(user: Omit<User, 'id' | 'createdAt'>): User {
    const users = this.getUsers();
    const newUser: User = {
      ...user,
      id: `usr-${Date.now()}`,
      createdAt: new Date().toISOString().split('T')[0],
    };
    users.push(newUser);
    setStored('users', users);
    notifyListeners();
    return newUser;
  },

  // Products
  getProducts(includeArchived = false): Product[] {
    const list = getStored<Product[]>('products', []);
    return list.filter(
      (product) =>
        product.approvalStatus !== 'pending' &&
        product.approvalStatus !== 'rejected' &&
        (includeArchived || !product.archived)
    );
  },

  getProductsForManagement(): Product[] {
    const products = getStored<Product[]>('products', []);
    const categories = getStored<CategoryRecord[]>('category_records', []);
    const brands = getStored<BrandRecord[]>('brand_records', []);
    return products.map((product) => ({
      ...product,
      categoryId: product.categoryId || categories.find(
        (category) => category.name.toLocaleLowerCase() === product.category?.toLocaleLowerCase()
      )?.id,
      brandId: product.brandId || brands.find(
        (brand) => brand.name.toLocaleLowerCase() === product.brand?.toLocaleLowerCase()
      )?.id,
    }));
  },

  getProductById(id: string): Product | undefined {
    return this.getProducts(true).find((p) => p.id === id);
  },

  getProductByBarcodeOrQR(code: string): Product | undefined {
    const clean = code.trim().toLowerCase();
    return this.getProducts(false).find(
      (p) =>
        p.barcode?.trim().toLowerCase() === clean ||
        p.qrCode?.trim().toLowerCase() === clean ||
        p.sku?.trim().toLowerCase() === clean ||
        p.id?.trim().toLowerCase() === clean
    );
  },

  async saveProduct(product: Omit<Product, 'id' | 'createdAt'> & { id?: string }): Promise<Product> {
    if (
      !product.name.trim() ||
      !product.sku.trim() ||
      !Number.isFinite(product.stock) ||
      product.stock < 0 ||
      !Number.isFinite(product.minStock) ||
      product.minStock < 0 ||
      !Number.isFinite(product.purchaseCost) ||
      product.purchaseCost < 0 ||
      !Number.isFinite(product.sellingPrice) ||
      product.sellingPrice < 0
    ) {
      throw new Error('Product name, SKU, stock, alert level, and prices must be valid non-negative values.');
    }

    const products = this.getProductsForManagement();
    const previousProducts = products.map((item) => ({ ...item }));
    const previousMovements = this.getStockMovements();
    let updated: Product;
    const isExistingProduct = Boolean(product.id && products.some((item) => item.id === product.id));
    const license = this.getServerLicense();
    if (!isExistingProduct && products.length >= getPlanLimits(license.planId, {
      users: license.userLimit,
      products: license.productLimit,
    }).products) {
      throw new Error('PLAN_PRODUCT_LIMIT_REACHED');
    }
    const now = new Date().toISOString().split('T')[0];
    const normalizedName = product.name.trim().toLocaleLowerCase();
    const identifiers = [product.sku, product.barcode, product.qrCode]
      .map((value) => value.trim().toLocaleLowerCase())
      .filter(Boolean);
    const duplicate = products.find((existing) => {
      if (existing.id === product.id) return false;
      return (
        existing.name.trim().toLocaleLowerCase() === normalizedName ||
        [existing.sku, existing.barcode, existing.qrCode]
          .some((value) => identifiers.includes(value.trim().toLocaleLowerCase()))
      );
    });
    if (duplicate) {
      throw new Error(`PRODUCT_ALREADY_EXISTS:${duplicate.name}`);
    }

    if (product.id) {
      const idx = products.findIndex((p) => p.id === product.id);
      const prev = products[idx];
      const activeUser = this.getActiveUser();
      const canApproveProducts = isBusinessAdministratorRole(activeUser.role);
      const isApprovedResubmission = prev?.approvalStatus === 'rejected' && canApproveProducts;
      updated = {
        ...prev,
        ...product,
        id: product.id,
        ...(prev?.approvalStatus === 'rejected'
          ? {
              approvalStatus: canApproveProducts ? 'accepted' : 'pending',
              submittedBy: activeUser.name,
              reviewedBy: undefined,
              reviewedAt: undefined,
            }
          : {}),
      };
      if (idx !== -1) {
        products[idx] = updated;
      } else {
        products.push(updated);
      }
      if (isApprovedResubmission) {
        this.addStockMovement({
          productId: updated.id,
          productName: updated.name,
          sku: updated.sku,
          type: 'initial',
          quantityDelta: updated.stock,
          previousStock: 0,
          newStock: updated.stock,
          reason: 'Business administrator approved a resubmitted product',
          userName: activeUser.name,
        }, false);
      } else if (prev && prev.stock !== updated.stock) {
        this.addStockMovement({
          productId: updated.id,
          productName: updated.name,
          sku: updated.sku,
          type: 'adjustment',
          quantityDelta: updated.stock - prev.stock,
          previousStock: prev.stock,
          newStock: updated.stock,
          reason: 'Manual stock edit from product management',
          userName: this.getActiveUser().name,
        }, false);
      }
    } else {
      const newId = `prod-${Date.now()}`;
      const activeUser = this.getActiveUser();
      updated = {
        ...product,
        id: newId,
        createdAt: now,
        approvalStatus: isBusinessAdministratorRole(activeUser.role) ? 'accepted' : 'pending',
        submittedBy: activeUser.name,
        qrCode: product.qrCode || `MQ-ICT-PROD-${Math.floor(1000 + Math.random() * 9000)}`,
      };
      products.unshift(updated);
      if (updated.approvalStatus === 'accepted') {
        this.addStockMovement({
          productId: updated.id,
          productName: updated.name,
          sku: updated.sku,
          type: 'initial',
          quantityDelta: updated.stock,
          previousStock: 0,
          newStock: updated.stock,
          reason: 'New product registered in catalog',
          userName: activeUser.name,
        }, false);
      }
    }

    setStored('products', products, false);
    const token = getStoredAccessToken();
    if (workspaceWritesEnabled && token) {
      try {
        await Promise.all([
          saveWorkspaceValue(token, 'products', products),
          saveWorkspaceValue(token, 'stock_movements', this.getStockMovements()),
        ]);
      } catch (error) {
        setStored('products', previousProducts, false);
        setStored('stock_movements', previousMovements, false);
        try {
          await Promise.all([
            saveWorkspaceValue(token, 'products', previousProducts),
            saveWorkspaceValue(token, 'stock_movements', previousMovements),
          ]);
        } catch (rollbackError) {
          console.error('Unable to roll back a failed product save in the secure workspace:', rollbackError);
        }
        notifyListeners();
        throw error;
      }
    }
    notifyListeners();
    return updated;
  },

  reviewProduct(id: string, approvalStatus: 'accepted' | 'rejected'): Product {
    const activeUser = this.getActiveUser();
    if (!isBusinessAdministratorRole(activeUser.role)) {
      throw new Error('Only an administrator can review product submissions.');
    }

    const products = this.getProductsForManagement();
    const product = products.find((item) => item.id === id);
    if (!product) throw new Error('Product not found.');
    if (product.approvalStatus !== 'pending') throw new Error('This product is not awaiting approval.');

    product.approvalStatus = approvalStatus;
    product.reviewedBy = activeUser.name;
    product.reviewedAt = new Date().toISOString();
    setStored('products', products);

    if (approvalStatus === 'accepted') {
      this.addStockMovement({
        productId: product.id,
        productName: product.name,
        sku: product.sku,
        type: 'initial',
        quantityDelta: product.stock,
        previousStock: 0,
        newStock: product.stock,
        reason: 'Admin approved new product submission',
        userName: activeUser.name,
      });
    } else {
      notifyListeners();
    }
    return product;
  },

  bulkImportProducts(items: Array<Partial<Product>>): { count: number; added: number; updated: number; duplicates: string[] } {
    const products = this.getProductsForManagement();
    const license = this.getServerLicense();
    const productLimit = getPlanLimits(license.planId, {
      users: license.userLimit,
      products: license.productLimit,
    }).products;
    let added = 0;
    const duplicates: string[] = [];
    const acceptedProducts: Product[] = [];
    const now = new Date().toISOString().split('T')[0];
    const activeUser = this.getActiveUser();
    const canApproveProducts = isBusinessAdministratorRole(activeUser.role);

    items.forEach((item) => {
      if (!item.name || !item.name.trim()) return;
      const cleanName = item.name.trim();
      const itemSku = item.sku?.trim().toLocaleLowerCase();
      const itemBarcode = item.barcode?.trim().toLocaleLowerCase();
      const existingIdx = products.findIndex(
        (p) =>
          (!!itemBarcode && p.barcode.trim().toLocaleLowerCase() === itemBarcode) ||
          (!!itemSku && p.sku.trim().toLocaleLowerCase() === itemSku) ||
          p.name.trim().toLocaleLowerCase() === cleanName.toLocaleLowerCase()
      );

      if (existingIdx !== -1) {
        duplicates.push(products[existingIdx].name);
      } else {
        if (products.length >= productLimit) {
          throw new Error('PLAN_PRODUCT_LIMIT_REACHED');
        }
        const newId = `prod-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        const newProd: Product = {
          id: newId,
          name: cleanName,
          nameSo: item.nameSo || cleanName,
          sku: item.sku || `MICT-${Math.floor(100 + Math.random() * 900)}`,
          barcode: item.barcode || `${Math.floor(100000000000 + Math.random() * 900000000000)}`,
          category: item.category || this.getCategories()[0] || '',
          brand: item.brand || 'Generic',
          purchaseCost: Number(item.purchaseCost || 0),
          sellingPrice: Number(item.sellingPrice || 0),
          wholesalePrice: Number(item.wholesalePrice || item.sellingPrice || 0),
          stock: Number(item.stock || 0),
          minStock: Number(item.minStock ?? 0),
          unit: (item.unit as any) || 'piece',
          image: item.image || '',
          description: item.description || '',
          qrCode: `MQ-ICT-PROD-${Math.floor(1000 + Math.random() * 9000)}`,
          createdAt: now,
          archived: false,
          approvalStatus: canApproveProducts ? 'accepted' : 'pending',
          submittedBy: activeUser.name,
        };
        products.push(newProd);
        added++;
        if (canApproveProducts) acceptedProducts.push(newProd);
      }
    });

    setStored('products', products);
    acceptedProducts.forEach((product) => {
      this.addStockMovement({
        productId: product.id,
        productName: product.name,
        sku: product.sku,
        type: 'initial',
        quantityDelta: product.stock,
        previousStock: 0,
        newStock: product.stock,
        reason: 'Business administrator imported product into catalog',
        userName: activeUser.name,
      });
    });
    const cats = this.getCategories();
    products.forEach((p) => {
      if (p.category && !cats.includes(p.category)) {
        cats.push(p.category);
      }
    });
    setStored('categories', cats);
    notifyListeners();
    return { count: added, added, updated: 0, duplicates };
  },

  async moveProductToRecyclingBin(id: string): Promise<void> {
    await this.moveRecordToRecyclingBin('products', id);
  },

  zeroProductStock(id: string): { message: string; previousValue: number } {
    const products = this.getProductsForManagement();
    const prod = products.find((p) => p.id === id);
    if (!prod) return { message: 'Product not found', previousValue: 0 };
    const previousValue = prod.stock * prod.purchaseCost;
    prod.stock = 0;
    setStored('products', products);
    notifyListeners();
    return {
      message: `Stock for "${prod.name}" zeroed out. Deducted $${previousValue.toFixed(2)} from inventory money.`,
      previousValue,
    };
  },

  getProductSalesStats(id: string): { totalSalesRevenue: number; totalQuantitySold: number; totalInvoicesCount: number } {
    const sales = this.getSales();
    let totalSalesRevenue = 0;
    let totalQuantitySold = 0;
    let totalInvoicesCount = 0;

    sales.forEach((s) => {
      const match = s.items.find((it) => it.productId === id);
      if (match) {
        totalSalesRevenue += match.total;
        totalQuantitySold += match.quantity;
        totalInvoicesCount += 1;
      }
    });

    return { totalSalesRevenue, totalQuantitySold, totalInvoicesCount };
  },

  // Stock Movement
  getStockMovements(): StockMovement[] {
    return getStored<StockMovement[]>('stock_movements', []);
  },

  addStockMovement(data: Omit<StockMovement, 'id' | 'date'>, persistRemote = true): StockMovement {
    const list = this.getStockMovements();
    const now = new Date();
    const dateStr = now.toISOString().replace('T', ' ').substring(0, 16);
    const entry: StockMovement = {
      ...data,
      id: `stk-${Date.now()}`,
      date: dateStr,
    };
    list.unshift(entry);
    setStored('stock_movements', list, persistRemote);
    notifyListeners();
    return entry;
  },

  adjustStock(productId: string, quantityDelta: number, reason: string, type: StockMovement['type'] = 'adjustment') {
    const products = this.getProductsForManagement();
    const prod = products.find((p) => p.id === productId);
    if (!prod) throw new Error('Product not found.');
    if (!Number.isFinite(quantityDelta) || quantityDelta === 0) {
      throw new Error('Stock movement quantity must be a non-zero number.');
    }

    const previousStock = prod.stock;
    const newStock = previousStock + quantityDelta;
    if (newStock < 0) {
      throw new Error(`Insufficient stock for "${prod.name}". Available: ${previousStock} ${prod.unit}.`);
    }
    prod.stock = newStock;
    setStored('products', products);

    this.addStockMovement({
      productId: prod.id,
      productName: prod.name,
      sku: prod.sku,
      type,
      quantityDelta,
      previousStock,
      newStock,
      reason,
      userName: this.getActiveUser().name,
    });
    notifyListeners();
  },

  // Customers
  getCustomers(): Customer[] {
    return getStored<Customer[]>('customers', INITIAL_CUSTOMERS);
  },

  getCustomerById(id: string): Customer | undefined {
    return this.getCustomers().find((c) => c.id === id);
  },

  async moveRecordToRecyclingBin(dataKey: string, recordId: string, replacementCategory?: string): Promise<void> {
    const token = getStoredAccessToken();
    if (!token || !workspaceWritesEnabled) {
      throw new Error('Your secure session is not ready. Please sign in again.');
    }
    const records = getStored<Array<unknown>>(dataKey, []);
    const matchesId = (record: unknown) => {
      if (typeof record === 'string') return record === recordId;
      if (!record || typeof record !== 'object') return false;
      const item = record as Record<string, unknown>;
      return String(item.id || item._id || item.name || item.invoiceNumber || item.purchaseNumber || '') === recordId;
    };
    const categoryExistsOnProducts = dataKey === 'categories' &&
      this.getProductsForManagement().some(
        (product) => product.category?.toLowerCase() === recordId.toLowerCase()
      );
    if (!records.some(matchesId) && !categoryExistsOnProducts) {
      throw new Error('The active record was not found. Refresh and retry.');
    }
    await moveWorkspaceRecordToRecyclingBin(token, dataKey, recordId, replacementCategory);
    setStored(dataKey, records.filter((record) => !matchesId(record)), false);
    if (dataKey === 'categories') {
      const deletedCategoryRecord = this.getCategoryRecordByName(recordId);
      const products = this.getProductsForManagement();
      const replacementRecord = replacementCategory
        ? this.getCategoryRecordByName(replacementCategory)
        : undefined;
      products.forEach((product) => {
        if (product.category?.toLowerCase() === recordId.toLowerCase()) {
          product.category = replacementCategory || '';
          product.categoryId = replacementRecord?.id;
        }
      });
      setStored('products', products, false);
      const categoryRecords = this.getCategoryRecords().filter(
        (category) => category.name.toLocaleLowerCase() !== recordId.toLocaleLowerCase()
      );
      if (deletedCategoryRecord) {
        categoryRecords.forEach((category) => {
          if (category.parentCategoryId === deletedCategoryRecord.id) {
            category.parentCategoryId = deletedCategoryRecord.parentCategoryId || '';
            category.updatedAt = new Date().toISOString();
          }
        });
      }
      setStored('category_records', categoryRecords, false);
      const token = getStoredAccessToken();
      if (token && workspaceWritesEnabled) {
        await Promise.all([
          saveWorkspaceValue(token, 'products', products),
          saveWorkspaceValue(token, 'category_records', categoryRecords),
        ]);
      }
      const descriptions = getStored<Record<string, string>>('category_descriptions', {});
      Object.keys(descriptions).forEach((name) => {
        if (name.toLowerCase() === recordId.toLowerCase()) delete descriptions[name];
      });
      setStored('category_descriptions', descriptions, false);
      const images = getStored<Record<string, string>>('category_images', {});
      Object.keys(images).forEach((name) => {
        if (name.toLowerCase() === recordId.toLowerCase()) delete images[name];
      });
      setStored('category_images', images);
    }
    notifyListeners();
  },

  async deleteCustomer(id: string): Promise<void> {
    await this.moveRecordToRecyclingBin('customers', id);
  },

  saveCustomer(
    customer: Omit<Customer, 'id' | 'customerId' | 'createdAt' | 'currentBalance' | 'totalCredit' | 'totalPayments'> & {
      id?: string;
    }
  ): Customer {
    const customers = this.getCustomers();
    let updated: Customer;
    const now = new Date().toISOString().split('T')[0];

    if (customer.id) {
      const idx = customers.findIndex((c) => c.id === customer.id);
      const prev = customers[idx];
      updated = {
        ...prev,
        ...customer,
        id: customer.id,
        currentBalance: prev.openingBalance + prev.totalCredit - prev.totalPayments,
      };
      if (idx !== -1) customers[idx] = updated;
    } else {
      const count = customers.length + 1001;
      const opening = Number(customer.openingBalance || 0);
      updated = {
        ...customer,
        id: `cust-${Date.now()}`,
        customerId: `CUST-${count}`,
        openingBalance: opening,
        totalCredit: 0,
        totalPayments: 0,
        currentBalance: opening,
        createdAt: now,
        status: 'active',
      };
      customers.unshift(updated);

      if (opening !== 0) {
        this.addCustomerLedgerEntry({
          customerId: updated.id,
          type: 'opening_balance',
          amount: opening,
          previousBalance: 0,
          newBalance: opening,
          reference: 'OPEN-BAL',
          notes: 'Customer account opening balance',
          cashierName: this.getActiveUser().name,
        });
      }
    }

    setStored('customers', customers);
    notifyListeners();
    return updated;
  },

  // Customer Ledger
  getCustomerLedger(customerId?: string): CustomerLedgerEntry[] {
    const list = getStored<CustomerLedgerEntry[]>('customer_ledger', []);
    return customerId ? list.filter((e) => e.customerId === customerId) : list;
  },

  getSupplierLedger(supplierId?: string): SupplierLedgerEntry[] {
    const list = getStored<SupplierLedgerEntry[]>('supplier_ledger', []);
    return supplierId ? list.filter((entry) => entry.supplierId === supplierId) : list;
  },

  addSupplierLedgerEntry(data: Omit<SupplierLedgerEntry, 'id' | 'date'>): SupplierLedgerEntry {
    const list = getStored<SupplierLedgerEntry[]>('supplier_ledger', []);
    const entry: SupplierLedgerEntry = {
      ...data,
      id: `sld-${Date.now()}`,
      date: new Date().toISOString().replace('T', ' ').substring(0, 16),
    };
    list.unshift(entry);
    setStored('supplier_ledger', list);
    return entry;
  },

  addCustomerLedgerEntry(data: Omit<CustomerLedgerEntry, 'id' | 'date'>): CustomerLedgerEntry {
    const list = getStored<CustomerLedgerEntry[]>('customer_ledger', []);
    const dateStr = new Date().toISOString().replace('T', ' ').substring(0, 16);
    const entry: CustomerLedgerEntry = {
      ...data,
      id: `cld-${Date.now()}`,
      date: dateStr,
    };
    list.unshift(entry);
    setStored('customer_ledger', list);
    notifyListeners();
    return entry;
  },

  // Record Customer Payment (Deyn Bixin)
  recordCustomerPayment(
    customerId: string,
    amount: number,
    paymentMethod: any,
    referenceNote: string
  ): { success: boolean; customer: Customer; receiptNumber: string } {
    const customers = this.getCustomers();
    const cust = customers.find((c) => c.id === customerId);
    if (!cust) throw new Error('Customer not found');

    const previousBalance = cust.currentBalance;
    cust.totalPayments += amount;
    cust.currentBalance = cust.openingBalance + cust.totalCredit - cust.totalPayments;

    const receiptNumber = `REC-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

    this.addCustomerLedgerEntry({
      customerId: cust.id,
      type: 'payment',
      amount,
      previousBalance,
      newBalance: cust.currentBalance,
      reference: receiptNumber,
      paymentMethod,
      notes: referenceNote || `Payment received via ${paymentMethod}`,
      cashierName: this.getActiveUser().name,
    });

    const sales = this.getSales();
    let remainingPayment = amount;
    for (const sale of sales) {
      if (sale.customerId === customerId && sale.outstandingBalance > 0 && remainingPayment > 0) {
        const toPay = Math.min(sale.outstandingBalance, remainingPayment);
        sale.paidAmount += toPay;
        sale.outstandingBalance -= toPay;
        sale.paymentStatus = sale.outstandingBalance === 0 ? 'paid' : 'partial';
        remainingPayment -= toPay;
      }
    }

    setStored('sales', sales);
    setStored('customers', customers);
    notifyListeners();
    return { success: true, customer: cust, receiptNumber };
  },

  // Suppliers
  getSuppliers(): Supplier[] {
    return getStored<Supplier[]>('suppliers', INITIAL_SUPPLIERS);
  },

  saveSupplier(
    supplier: Omit<Supplier, 'id' | 'supplierId' | 'createdAt' | 'currentBalance' | 'totalPurchases' | 'totalPayments'> & {
      id?: string;
    }
  ): Supplier {
    const list = this.getSuppliers();
    let updated: Supplier;
    const now = new Date().toISOString().split('T')[0];

    if (supplier.id) {
      const idx = list.findIndex((s) => s.id === supplier.id);
      const prev = list[idx];
      updated = {
        ...prev,
        ...supplier,
        id: supplier.id,
        currentBalance: prev.openingBalance + prev.totalPurchases - prev.totalPayments,
      };
      if (idx !== -1) list[idx] = updated;
    } else {
      const count = list.length + 2001;
      const opening = Number(supplier.openingBalance || 0);
      updated = {
        ...supplier,
        id: `sup-${Date.now()}`,
        supplierId: `SUPP-${count}`,
        openingBalance: opening,
        totalPurchases: 0,
        totalPayments: 0,
        currentBalance: opening,
        createdAt: now,
        status: 'active',
      };
      list.unshift(updated);
    }

    setStored('suppliers', list);
    notifyListeners();
    return updated;
  },

  recordSupplierPayment(
    supplierId: string,
    amount: number,
    paymentMethod: string,
    referenceNote: string
  ): { success: boolean; supplier: Supplier } {
    const suppliers = this.getSuppliers();
    const sup = suppliers.find((s) => s.id === supplierId);
    if (!sup) throw new Error('Supplier not found');

    sup.totalPayments += amount;
    sup.currentBalance = sup.openingBalance + sup.totalPurchases - sup.totalPayments;

    this.addSupplierLedgerEntry({
      supplierId: sup.id,
      type: 'payment',
      amount,
      previousBalance: sup.currentBalance + amount,
      newBalance: sup.currentBalance,
      paymentMethod,
      notes: referenceNote || `Payment made via ${paymentMethod}`,
      userName: this.getActiveUser().name,
    });
    setStored('suppliers', suppliers);
    notifyListeners();
    return { success: true, supplier: sup };
  },

  async deleteSupplier(id: string): Promise<void> {
    await this.moveRecordToRecyclingBin('suppliers', id);
  },

  // Sales & POS Invoices
  getSales(): SaleInvoice[] {
    return getStored<SaleInvoice[]>('sales', INITIAL_SALES);
  },

  createSale(
    data: Omit<SaleInvoice, 'id' | 'invoiceNumber' | 'date' | 'qrIdentifier' | 'currency'>
  ): SaleInvoice {
    if (data.heldOrderId) {
      const existingSale = this.getSales().find((sale) => sale.heldOrderId === data.heldOrderId);
      if (existingSale) return existingSale;
    }
    const quantitiesByProduct = new Map<string, number>();
    data.items.forEach((item) => {
      if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
        throw new Error('Sale quantities must be positive numbers.');
      }
      quantitiesByProduct.set(item.productId, (quantitiesByProduct.get(item.productId) || 0) + item.quantity);
    });
    quantitiesByProduct.forEach((quantity, productId) => {
      const product = this.getProductById(productId);
      if (!product) throw new Error('A product in this sale no longer exists.');
      if (product.stock < quantity) {
        throw new Error(`Insufficient stock for "${product.name}". Available: ${product.stock} ${product.unit}.`);
      }
    });

    const sales = this.getSales();
    const settings = this.getSettings();
    const now = new Date();
    const dateStr = now.toISOString().replace('T', ' ').substring(0, 16);
    const invoiceNum = `INV-${now.getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

    const newSale: SaleInvoice = {
      ...data,
      id: `inv-${Date.now()}`,
      invoiceNumber: invoiceNum,
      date: dateStr,
      qrIdentifier: invoiceNum,
      currency: settings.currency,
    };

    data.items.forEach((item) => {
      this.adjustStock(
        item.productId,
        -item.quantity,
        `POS Sale Checkout (${invoiceNum})`,
        'sale'
      );
    });

    if (data.customerId && data.customerId !== 'walk-in') {
      const customers = this.getCustomers();
      const cust = customers.find((c) => c.id === data.customerId);
      if (cust) {
        if (data.paymentMethod === 'deyn' || data.outstandingBalance > 0) {
          const debtAmount = data.outstandingBalance;
          const prevBalance = cust.currentBalance;
          cust.totalCredit += debtAmount;
          cust.currentBalance = cust.openingBalance + cust.totalCredit - cust.totalPayments;

          this.addCustomerLedgerEntry({
            customerId: cust.id,
            type: 'credit_sale',
            amount: debtAmount,
            previousBalance: prevBalance,
            newBalance: cust.currentBalance,
            reference: invoiceNum,
            notes: `Credit Sale: ${data.items.map((i) => `${i.productName} (x${i.quantity})`).join(', ')}`,
            cashierName: data.cashierName,
          });

          setStored('customers', customers);
        }
      }
    }

    sales.unshift(newSale);
    setStored('sales', sales);
    notifyListeners();
    return newSale;
  },

  refundSale(invoiceId: string, reason: string): SaleInvoice {
    const sales = this.getSales();
    const sale = sales.find((s) => s.id === invoiceId);
    if (!sale) throw new Error('Invoice not found');
    if (sale.paymentStatus === 'refunded') {
      throw new Error('Invoice is already refunded');
    }

    sale.paymentStatus = 'refunded';
    sale.notes = (sale.notes ? sale.notes + ' | ' : '') + `Refunded: ${reason}`;

    sale.items.forEach((item) => {
      this.adjustStock(
        item.productId,
        item.quantity,
        `Refund for ${sale.invoiceNumber}: ${reason}`,
        'return'
      );
    });

    if (sale.customerId && sale.paymentMethod === 'deyn') {
      const customers = this.getCustomers();
      const cust = customers.find((c) => c.id === sale.customerId);
      if (cust) {
        const prevBalance = cust.currentBalance;
        cust.totalCredit -= sale.totalAmount;
        cust.currentBalance = cust.openingBalance + cust.totalCredit - cust.totalPayments;

        this.addCustomerLedgerEntry({
          customerId: cust.id,
          type: 'refund',
          amount: sale.totalAmount,
          previousBalance: prevBalance,
          newBalance: cust.currentBalance,
          reference: `REF-${sale.invoiceNumber}`,
          notes: `Invoice Refund: ${reason}`,
          cashierName: this.getActiveUser().name,
        });

        setStored('customers', customers);
      }
    }

    setStored('sales', sales);
    notifyListeners();
    return sale;
  },

  // Purchases
  getPurchases(): PurchaseInvoice[] {
    return getStored<PurchaseInvoice[]>('purchases', []);
  },

  createPurchase(data: Omit<PurchaseInvoice, 'id' | 'purchaseNumber' | 'date'>): PurchaseInvoice {
    if (data.received) {
      data.items.forEach((item) => {
        if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
          throw new Error('Purchase quantities must be positive numbers.');
        }
        if (!this.getProductById(item.productId)) {
          throw new Error('A product in this purchase no longer exists.');
        }
      });
    }

    const purchases = this.getPurchases();
    const now = new Date();
    const dateStr = now.toISOString().replace('T', ' ').substring(0, 16);
    const purchaseNum = `PO-${now.getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

    const newPurchase: PurchaseInvoice = {
      ...data,
      id: `po-${Date.now()}`,
      purchaseNumber: purchaseNum,
      date: dateStr,
    };

    if (data.received) {
      data.items.forEach((item) => {
        this.adjustStock(
          item.productId,
          item.quantity,
          `Purchase delivery received (${purchaseNum})`,
          'restock'
        );
      });
    }

    const suppliers = this.getSuppliers();
    const sup = suppliers.find((s) => s.id === data.supplierId);
    if (sup) {
      sup.totalPurchases += data.totalCost;
      sup.totalPayments += data.paidAmount;
      sup.currentBalance = sup.openingBalance + sup.totalPurchases - sup.totalPayments;
      setStored('suppliers', suppliers);
    }

    purchases.unshift(newPurchase);
    setStored('purchases', purchases);
    notifyListeners();
    return newPurchase;
  },

  // Subscription Plans
  getPlans(): SubscriptionPlan[] {
    const currentPlanId = this.getServerLicense().planId;
    return INITIAL_PLANS.map((plan) => ({
      ...plan,
      isCurrent: plan.id === currentPlanId,
    }));
  },

  // Categories Management
  getCategories(): string[] {
    const list = getStored<string[]>('categories', []);
    const products = this.getProductsForManagement();
    const merged = Array.from(new Set([...list, ...products.map((p) => p.category)])).filter(Boolean);
    return merged;
  },

  getCategoryRecords(): CategoryRecord[] {
    const records = getStored<CategoryRecord[]>('category_records', []);
    const byName = new Map(records.map((record) => [record.name.toLocaleLowerCase(), record]));
    const categories = this.getCategories();
    const usedCodes = new Set(records.map((record) => record.code.toLocaleLowerCase()));
    return categories.map((name) => {
      const current = byName.get(name.toLocaleLowerCase());
      if (current) return current;
      const oldDescription = this.getCategoryDescription(name);
      let code = catalogCode('CAT', name);
      if (usedCodes.has(code.toLocaleLowerCase())) code = `${code}-${catalogRecordId('X', name).slice(-6)}`;
      usedCodes.add(code.toLocaleLowerCase());
      const now = new Date().toISOString();
      return {
        id: catalogRecordId('category', name),
        name,
        code,
        description: oldDescription,
        image: this.getCategoryImage(name),
        parentCategoryId: '',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      };
    });
  },

  getCategoryRecordByName(name: string): CategoryRecord | undefined {
    return this.getCategoryRecords().find((record) => record.name.toLocaleLowerCase() === name.toLocaleLowerCase());
  },

  getCategoryDescription(name: string): string {
    const descriptions = getStored<Record<string, string>>('category_descriptions', {});
    const key = Object.keys(descriptions).find((category) => category.toLowerCase() === name.toLowerCase());
    return key ? descriptions[key] : '';
  },

  getCategoryImage(name: string): string {
    const images = getStored<Record<string, string>>('category_images', {});
    const key = Object.keys(images).find((category) => category.toLowerCase() === name.toLowerCase());
    return key ? images[key] : '';
  },

  assignProductsToCategory(productIds: string[], categoryId: string): number {
    const category = this.getCategoryRecords().find((record) => record.id === categoryId);
    if (!category || category.status !== 'active') throw new Error('Choose an active category.');
    const selected = new Set(productIds);
    const products = this.getProductsForManagement();
    let updated = 0;
    products.forEach((product) => {
      if (!selected.has(product.id)) return;
      product.category = category.name;
      product.categoryId = category.id;
      updated += 1;
    });
    if (updated) setStored('products', products);
    return updated;
  },

  addCategory(
    name: string,
    description = '',
    image = '',
    details: Partial<Pick<CategoryRecord, 'code' | 'parentCategoryId' | 'status'>> = {}
  ): boolean {
    const clean = name.trim();
    if (!clean) return false;
    const cats = this.getCategories();
    if (cats.some((c) => c.toLowerCase() === clean.toLowerCase())) {
      return false;
    }
    const records = this.getCategoryRecords();
    const code = (details.code || catalogCode('CAT', clean)).trim();
    if (records.some((record) => record.code.toLocaleLowerCase() === code.toLocaleLowerCase())) {
      throw new Error(`Category code "${code}" already exists.`);
    }
    if (details.parentCategoryId && !records.some((record) => record.id === details.parentCategoryId)) {
      throw new Error('Choose an existing parent category.');
    }
    const now = new Date().toISOString();
    const record: CategoryRecord = {
      id: `category-${crypto.randomUUID()}`,
      name: clean,
      code,
      description: description.trim(),
      image: image.trim(),
      parentCategoryId: details.parentCategoryId || '',
      status: details.status || 'active',
      createdAt: now,
      updatedAt: now,
    };
    cats.push(clean);
    setStored('categories', cats);
    setStored('category_records', [...records, record]);
    const descriptions = getStored<Record<string, string>>('category_descriptions', {});
    if (description.trim()) descriptions[clean] = description.trim();
    setStored('category_descriptions', descriptions);
    const images = getStored<Record<string, string>>('category_images', {});
    if (image.trim()) images[clean] = image.trim();
    setStored('category_images', images);
    notifyListeners();
    return true;
  },

  updateCategory(
    oldName: string,
    newName: string,
    description?: string,
    image?: string,
    details: Partial<Pick<CategoryRecord, 'code' | 'parentCategoryId' | 'status'>> = {}
  ): boolean {
    const cleanNew = newName.trim();
    if (!cleanNew) return false;
    let cats = this.getCategories();
    if (!cats.some((category) => category.toLowerCase() === oldName.toLowerCase())) return false;
    if (cats.some((category) => category.toLowerCase() === cleanNew.toLowerCase() && category.toLowerCase() !== oldName.toLowerCase())) {
      return false;
    }
    const records = this.getCategoryRecords();
    const oldRecord = records.find((record) => record.name.toLocaleLowerCase() === oldName.toLocaleLowerCase());
    if (!oldRecord) return false;
    const nextCode = (details.code || oldRecord.code).trim();
    if (records.some((record) =>
      record.id !== oldRecord.id && record.code.toLocaleLowerCase() === nextCode.toLocaleLowerCase()
    )) {
      throw new Error(`Category code "${nextCode}" already exists.`);
    }
    if (details.parentCategoryId === oldRecord.id) throw new Error('A category cannot be its own parent.');
    if (details.parentCategoryId && !records.some((record) => record.id === details.parentCategoryId)) {
      throw new Error('Choose an existing parent category.');
    }
    let parentRecord = records.find((record) => record.id === details.parentCategoryId);
    const visitedParents = new Set([oldRecord.id]);
    while (parentRecord) {
      if (visitedParents.has(parentRecord.id)) throw new Error('Category hierarchy cannot contain a cycle.');
      visitedParents.add(parentRecord.id);
      parentRecord = records.find((record) => record.id === parentRecord?.parentCategoryId);
    }
    cats = cats.map((c) => (c.toLowerCase() === oldName.toLowerCase() ? cleanNew : c));
    setStored('categories', Array.from(new Set(cats)));
    const now = new Date().toISOString();
    const updatedRecord: CategoryRecord = {
      ...oldRecord,
      name: cleanNew,
      code: nextCode,
      description: description?.trim() ?? oldRecord.description,
      image: image?.trim() ?? oldRecord.image,
      parentCategoryId: details.parentCategoryId ?? oldRecord.parentCategoryId,
      status: details.status ?? oldRecord.status,
      updatedAt: now,
    };
    setStored('category_records', records.map((record) => record.id === oldRecord.id ? updatedRecord : record));

    const descriptions = getStored<Record<string, string>>('category_descriptions', {});
    const oldDescriptionKey = Object.keys(descriptions).find((category) => category.toLowerCase() === oldName.toLowerCase());
    const nextDescription = description?.trim() ?? (oldDescriptionKey ? descriptions[oldDescriptionKey] : '');
    Object.keys(descriptions).forEach((category) => {
      if (category.toLowerCase() === oldName.toLowerCase()) delete descriptions[category];
    });
    if (nextDescription) descriptions[cleanNew] = nextDescription;
    setStored('category_descriptions', descriptions);

    const images = getStored<Record<string, string>>('category_images', {});
    const oldImageKey = Object.keys(images).find((category) => category.toLowerCase() === oldName.toLowerCase());
    const nextImage = image?.trim() ?? (oldImageKey ? images[oldImageKey] : '');
    Object.keys(images).forEach((category) => {
      if (category.toLowerCase() === oldName.toLowerCase()) delete images[category];
    });
    if (nextImage) images[cleanNew] = nextImage;
    setStored('category_images', images);

    const products = this.getProductsForManagement();
    let updatedProducts = false;
    products.forEach((p) => {
      if (p.category && p.category.toLowerCase() === oldName.toLowerCase()) {
        p.category = cleanNew;
        updatedProducts = true;
      }
    });
    if (updatedProducts) {
      setStored('products', products);
    }
    notifyListeners();
    return true;
  },

  getBrandRecords(): BrandRecord[] {
    const records = getStored<BrandRecord[]>('brand_records', []);
    const knownNames = new Set(records.map((brand) => brand.name.toLocaleLowerCase()));
    const legacyBrands = Array.from(new Set(
      getStored<Product[]>('products', []).map((product) => product.brand?.trim()).filter(Boolean)
    )).filter((name) => !knownNames.has(name.toLocaleLowerCase()));
    return [
      ...records.map((record) => ({
        ...record,
        code: record.code || catalogCode('BR', record.name),
        manufacturer: record.manufacturer || '',
        website: record.website || '',
        contactInformation: record.contactInformation || '',
        status: record.status || 'active',
        updatedAt: record.updatedAt || record.createdAt,
      })),
      ...legacyBrands.map((name) => ({
        id: catalogRecordId('legacy-brand', name),
        name,
        code: catalogCode('BR', name),
        description: '',
        image: '',
        manufacturer: '',
        website: '',
        contactInformation: '',
        status: 'active' as const,
        createdAt: '',
        updatedAt: '',
      })),
    ];
  },

  assignProductsToBrand(productIds: string[], brandId: string): number {
    const brand = this.getBrandRecords().find((record) => record.id === brandId);
    if (!brand || brand.status !== 'active') throw new Error('Choose an active brand.');
    const selected = new Set(productIds);
    const products = this.getProductsForManagement();
    let updated = 0;
    products.forEach((product) => {
      if (!selected.has(product.id)) return;
      product.brand = brand.name;
      product.brandId = brand.id;
      updated += 1;
    });
    if (updated) setStored('products', products);
    return updated;
  },

  addBrand(
    name: string,
    description = '',
    image = '',
    details: Partial<Pick<BrandRecord, 'code' | 'manufacturer' | 'website' | 'contactInformation' | 'status'>> = {}
  ): BrandRecord {
    const clean = name.trim();
    if (!clean) throw new Error('Brand name is required.');
    const existingRecords = this.getBrandRecords();
    if (existingRecords.some((brand) => brand.name.toLocaleLowerCase() === clean.toLocaleLowerCase())) {
      throw new Error(`Brand "${clean}" already exists.`);
    }
    const code = (details.code || catalogCode('BR', clean)).trim();
    if (existingRecords.some((brand) => brand.code?.toLocaleLowerCase() === code.toLocaleLowerCase())) {
      throw new Error(`Brand code "${code}" already exists.`);
    }
    const now = new Date().toISOString();
    const brand: BrandRecord = {
      id: `brand-${crypto.randomUUID()}`,
      name: clean,
      code,
      description: description.trim(),
      image: image.trim(),
      manufacturer: details.manufacturer?.trim() || '',
      website: details.website?.trim() || '',
      contactInformation: details.contactInformation?.trim() || '',
      status: details.status || 'active',
      createdAt: now,
      updatedAt: now,
    };
    const records = getStored<BrandRecord[]>('brand_records', []);
    records.push(brand);
    setStored('brand_records', records);
    notifyListeners();
    return brand;
  },

  updateBrand(
    id: string,
    name: string,
    description: string,
    image: string,
    details: Partial<Pick<BrandRecord, 'code' | 'manufacturer' | 'website' | 'contactInformation' | 'status'>> = {}
  ): BrandRecord {
    const clean = name.trim();
    if (!clean) throw new Error('Brand name is required.');
    const records = getStored<BrandRecord[]>('brand_records', []);
    const currentRecord = this.getBrandRecords().find((item) => item.id === id);
    if (!currentRecord) throw new Error('Brand not found.');
    const code = (details.code || currentRecord.code || catalogCode('BR', clean)).trim();
    if (this.getBrandRecords().some((item) =>
      item.id !== id && (
        item.name.toLocaleLowerCase() === clean.toLocaleLowerCase() ||
        item.code?.toLocaleLowerCase() === code.toLocaleLowerCase()
      )
    )) {
      throw new Error(`Brand "${clean}" already exists.`);
    }
    let brand = records.find((item) => item.id === id);
    if (!brand && id.startsWith('legacy-brand-')) {
      brand = {
        id: `brand-${crypto.randomUUID()}`,
        name: currentRecord.name,
        code: currentRecord.code || catalogCode('BR', currentRecord.name),
        description: currentRecord.description || '',
        image: currentRecord.image || '',
        manufacturer: currentRecord.manufacturer || '',
        website: currentRecord.website || '',
        contactInformation: currentRecord.contactInformation || '',
        status: currentRecord.status || 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      records.push(brand);
    }
    if (!brand) throw new Error('Brand not found.');
    const oldName = brand.name;
    Object.assign(brand, {
      name: clean,
      code,
      description: description.trim(),
      image: image.trim(),
      manufacturer: details.manufacturer?.trim() ?? brand.manufacturer ?? '',
      website: details.website?.trim() ?? brand.website ?? '',
      contactInformation: details.contactInformation?.trim() ?? brand.contactInformation ?? '',
      status: details.status ?? brand.status ?? 'active',
      updatedAt: new Date().toISOString(),
    });
    const products = this.getProductsForManagement();
    let productsChanged = false;
    products.forEach((product) => {
      if (product.brand?.toLocaleLowerCase() === oldName.toLocaleLowerCase()) {
        product.brand = clean;
        product.brandId = brand.id;
        productsChanged = true;
      }
    });
    if (productsChanged) setStored('products', products);
    setStored('brand_records', records);
    notifyListeners();
    return brand;
  },

  async deleteBrand(id: string): Promise<void> {
    const records = getStored<BrandRecord[]>('brand_records', []);
    const brand = records.find((item) => item.id === id) || this.getBrandRecords().find((item) => item.id === id);
    if (!brand) throw new Error('Brand not found.');
    const previousProducts = this.getProductsForManagement();
    const products = previousProducts.map((product) => ({ ...product }));
    const affectedProducts = products.filter(
      (product) => product.brand?.toLocaleLowerCase() === brand.name.toLocaleLowerCase()
    );
    affectedProducts.forEach((product) => { product.brand = 'Generic'; });
    affectedProducts.forEach((product) => { product.brandId = undefined; });
    const updatedRecords = records.filter(
      (item) => item.id !== id && item.name.toLocaleLowerCase() !== brand.name.toLocaleLowerCase()
    );
    setStored('products', products, false);
    setStored('brand_records', updatedRecords, false);
    try {
      await Promise.all([
        ...(affectedProducts.length ? [setStored('products', products)] : []),
        setStored('brand_records', updatedRecords),
      ]);
    } catch (error) {
      setStored('products', previousProducts, false);
      setStored('brand_records', records, false);
      const rollbackResults = await Promise.allSettled([
        ...(affectedProducts.length ? [setStored('products', previousProducts)] : []),
        setStored('brand_records', records),
      ]);
      rollbackResults.forEach((result) => {
        if (result.status === 'rejected') {
          console.error('Unable to roll back a failed brand deletion in the secure workspace:', result.reason);
        }
      });
      notifyListeners();
      throw error;
    }
    notifyListeners();
  },

  async deleteCategory(name: string, fallback?: string): Promise<boolean> {
    await this.moveRecordToRecyclingBin('categories', name, fallback);
    return true;
  },

  // Full clean wipe of transactions
  clearAllDashboardMoney(): void {
    setStored('sales', []);
    setStored('purchases', []);
    setStored('customer_ledger', []);
    setStored('stock_movements', []);
    const customers = this.getCustomers();
    customers.forEach((c) => {
      c.totalCredit = 0;
      c.openingBalance = 0;
      c.totalPayments = 0;
      c.currentBalance = 0;
    });
    setStored('customers', customers);
    setStored('suppliers', []);
    notifyListeners();
  },

  // Clear all business data permanently
  clearAllBusinessData(): void {
    setStored('customers', []);
    setStored('suppliers', []);
    setStored('products', []);
    setStored('categories', []);
    setStored('category_records', []);
    setStored('category_descriptions', {});
    setStored('category_images', {});
    setStored('brand_records', []);
    setStored('sales', []);
    setStored('purchases', []);
    setStored('customer_ledger', []);
    setStored('supplier_ledger', []);
    setStored('stock_movements', []);
    setStored('payroll', []);
    setStored('attendance', []);
    setStored('leave_records', []);
    notifyListeners();
  },

  // Currency Formatter
  formatMoney(amount: number, overrideCurrency?: CurrencyCode): string {
    const settings = this.getSettings();
    const curCode = overrideCurrency || settings.currency;
    const curInfo = CURRENCY_SYMBOLS[curCode] || CURRENCY_SYMBOLS.USD;
    const converted = (amount || 0) * (curInfo.rateAgainstUSD || 1);
    if (curCode === 'SOS') {
      return `${Math.round(converted).toLocaleString()} ${curInfo.symbol}`;
    }
    return `${curInfo.symbol}${converted.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  },
};
