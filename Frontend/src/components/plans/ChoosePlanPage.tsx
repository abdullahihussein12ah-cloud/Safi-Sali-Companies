import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Crown,
  KeyRound,
  MessageCircle,
  PhoneCall,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Unlock,
  X,
  Zap,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { getBusinessSubscriptionPlans, getStoredAccessToken } from '../../services/api';
import { AppStore } from '../../services/store';
import { TRIAL_DURATION_DAYS } from '../../services/licenseLimits';

const parseLicenseTimestamp = (value: string): number => {
  const normalized = value.trim().replace(' ', 'T');
  if (!normalized) return Number.NaN;
  const hasTimezone = /(?:Z|[+-]\d{2}:\d{2})$/i.test(normalized);
  return new Date(hasTimezone ? normalized : `${normalized}Z`).getTime();
};

type Plan = {
  id: string;
  name: string;
  price: number;
  durationDays: number;
  billingPeriod: string;
  description: string;
  userLimit: string;
  productLimit: string;
  features: string[];
  nameSo: string;
  descriptionSo: string;
  featuresSo: string[];
  badgeSo?: string;
  ussdCode: string;
  purchaseUrl?: string;
  badge?: string;
  popular?: boolean;
  lifetime?: boolean;
};

const planPurchaseUrls: Record<string, string> = {
  'plan-basic': import.meta.env.VITE_PLAN_BASIC_PURCHASE_URL?.trim() || '',
  'plan-professional': import.meta.env.VITE_PLAN_PROFESSIONAL_PURCHASE_URL?.trim() || '',
  'plan-enterprise': import.meta.env.VITE_PLAN_ENTERPRISE_PURCHASE_URL?.trim() || '',
  'plan-annual': import.meta.env.VITE_PLAN_ANNUAL_PURCHASE_URL?.trim() || '',
  'plan-lifetime': import.meta.env.VITE_PLAN_LIFETIME_PURCHASE_URL?.trim() || '',
};

const plans: Plan[] = [
  {
    id: 'plan-trial',
    name: '365-Day Free Trial',
    nameSo: 'Tijaabo Bilaash ah 365 Maalmood',
    price: 0,
    durationDays: TRIAL_DURATION_DAYS,
    billingPeriod: '365-day free trial',
    description: 'Try the full basic retail plan for 365 days.',
    descriptionSo: 'Ku tijaabi qorshaha tafaariiqda aasaasiga ah muddo 365 maalmood ah.',
    userLimit: '3',
    productLimit: '500',
    features: [
      'Basic POS checkout',
      'Up to 3 users',
      'Up to 500 Products',
      'Cash Sales only',
      'Standard Receipts',
      '365-Day Free Trial (8,760 Hours)',
      'Real-Time License Countdown',
      'Automatic Lockout When Trial Expires',
    ],
    featuresSo: [
      'Iibka POS ee aasaasiga ah',
      'Ilaa 3 isticmaale',
      'Ilaa 500 badeeco',
      'Iibka kaashka oo keliya',
      'Rasiid caadi ah',
      'Tijaabo 365 maalmood ah (8,760 saacadood)',
      'Tirinta waqtiga ruqsadda waqtiga-dhabta ah',
      'Quful toos ah marka tijaabadu dhammaato',
    ],
    ussdCode: '',
    badge: '365-Day Free Trial',
    badgeSo: 'Tijaabo Bilaash ah 365 Maalmood',
  },
  {
    id: 'plan-basic',
    name: 'Basic Retail Plan',
    nameSo: 'Qorshaha Tafaariiqda Aasaasiga ah',
    price: 3,
    durationDays: 30,
    billingPeriod: 'month',
    description: 'Perfect for established single-location retail shops and small supermarkets.',
    descriptionSo: 'Ku habboon dukaamada tafaariiqda iyo suuqyada yaryar.',
    userLimit: '3',
    productLimit: '500',
    features: [
      'Full POS & QR Scanner',
      'Customer Debts & Ledger',
      'Supplier Tracking',
      'Thermal Receipt Printing',
      'PDF & Excel Reports',
      'Email Support',
    ],
    featuresSo: [
      'POS buuxa & akhristaha QR',
      'Deymaha macaamiisha & diiwaanka xisaabta',
      'La-socodka alaab-qeybiyeyaasha',
      'Daabacaadda rasiidka kulaylka',
      'Warbixinnada PDF & Excel',
      'Taageerada iimaylka',
    ],
    ussdCode: '*712*683723015*3#',
    badge: '$3 / Month',
    badgeSo: '$3 / Bil',
    purchaseUrl: planPurchaseUrls['plan-basic'],
  },
  {
    id: 'plan-professional',
    name: 'Professional Business Plan',
    nameSo: 'Qorshaha Ganacsi ee Xirfadaysan',
    price: 5,
    durationDays: 30,
    billingPeriod: 'month',
    description: 'Designed for busy wholesale distributors, IT shops, and growing businesses.',
    descriptionSo: 'Loogu talagalay qaybiyeyaasha jumlada, dukaamada IT-ga iyo ganacsiyada koraya.',
    userLimit: '10',
    productLimit: 'Unlimited',
    features: [
      'Unlimited Products & Invoices',
      'Full Accounting Ledger & Rasiid Receipts',
      'Cost of Goods Sold (COGS)',
      'Multi-Currency Support',
      'Somali Language Support',
      'Inventory Alerts',
      'Audit Logging & Role-Based Access Control',
      'Priority 24/7 Support',
    ],
    featuresSo: [
      'Badeecooyin & qaansheegyo aan xadidnayn',
      'Diiwaanka xisaabaadka buuxa & rasiidhada',
      'Qiimaha badeecadda la iibiyey (COGS)',
      'Taageerada lacagaha kala duwan',
      'Taageerada luqadda Soomaaliga',
      'Digniinaha kaydka',
      'Diiwaangelinta hubinta & xakamaynta gelitaanka',
      'Taageero mudnaan leh 24/7',
    ],
    ussdCode: '*712*683723015*5#',
    badge: '$5 / Month',
    badgeSo: '$5 / Bil',
    popular: true,
    purchaseUrl: planPurchaseUrls['plan-professional'],
  },
  {
    id: 'plan-enterprise',
    name: 'Enterprise Wholesaler Plan',
    nameSo: 'Qorshaha Jumladleyda Ganacsiga Weyn',
    price: 30,
    durationDays: 30,
    billingPeriod: 'month',
    description: 'Comprehensive solution for multi-warehouse and high-volume operations.',
    descriptionSo: 'Xal dhammaystiran oo loogu talagalay bakhaarro badan iyo hawlgallo waaweyn.',
    userLimit: 'Unlimited',
    productLimit: 'Unlimited',
    features: [
      'Everything in the Professional Plan',
      'Unlimited Staff Accounts',
      'Custom Roles & Permissions',
      'Multi-Warehouse Management',
      'Advanced Business Management',
      'Automated Daily Data Synchronization',
      'Advanced Inventory & Ledger Management',
      'Dedicated Account Manager',
      'Enterprise-Level Business Support',
    ],
    featuresSo: [
      'Dhammaan adeegyada qorshaha xirfadaysan',
      'Akoonno shaqaale oo aan xadidnayn',
      'Doorar & oggolaansho gaar ah',
      'Maamulka bakhaarro badan',
      'Maamulka ganacsiga heer sare',
      'Is-waafajin xog maalinle ah oo toos ah',
      'Maamulka kaydka & xisaabta heer sare',
      'Maamule akoon oo gaar ah',
      'Taageero ganacsi oo heer shirkadeed',
    ],
    ussdCode: '*712*683723015*30#',
    badge: '$30 / Month',
    badgeSo: '$30 / Bil',
    purchaseUrl: planPurchaseUrls['plan-enterprise'],
  },
  {
    id: 'plan-annual',
    name: 'Annual Enterprise Plan',
    nameSo: 'Qorshaha Sannadlaha ah ee Ganacsiga Weyn',
    price: 360,
    durationDays: 365,
    billingPeriod: 'year',
    description: 'Full-year enterprise licensing for teams that need complete retail control.',
    descriptionSo: 'Ruqsad sannad buuxa ah oo kooxaha u baahan maamulka tafaariiqda oo dhamaystiran.',
    userLimit: 'Unlimited',
    productLimit: 'Unlimited',
    features: [
      'All Professional & Enterprise Features',
      'Unlimited Products, Categories & Invoices',
      'Unlimited Staff Accounts & Operator Roles',
      'Full Multi-Currency Ledger',
      'USD, SOS, SLSH, KES & ETB Support',
      'Automated Database Backups & Cloud Sync',
      'Advanced Reports & Business Analytics',
      'VIP Technical Support',
      'Thermal Printer & POS Hardware Integration',
      '365-Day Enterprise License',
    ],
    featuresSo: [
      'Dhammaan adeegyada qorshayaasha xirfadaysan & ganacsiga weyn',
      'Badeecooyin, qaybo & qaansheegyo aan xadidnayn',
      'Akoonno shaqaale & doorar hawl-wadeen oo aan xadidnayn',
      'Diiwaanka lacagaha kala duwan oo buuxa',
      'Taageerada USD, SOS, SLSH, KES & ETB',
      'Kayd-raacyo xogeed & Cloud Sync toos ah',
      'Warbixinno heer sare & falanqaynta ganacsiga',
      'Taageero farsamo oo VIP ah',
      'Isku-xirka printer-ka kulaylka & qalabka POS',
      'Ruqsad ganacsi oo 365 maalmood ah',
    ],
    ussdCode: '*712*683723015*360#',
    badge: '365-Day License',
    badgeSo: 'Ruqsad 365 Maalmood ah',
    purchaseUrl: planPurchaseUrls['plan-annual'],
  },
  {
    id: 'plan-lifetime',
    name: 'Lifetime Enterprise Plan',
    nameSo: 'Qorshaha Ganacsiga Weyn ee Joogtada ah',
    price: 7000,
    durationDays: 0,
    billingPeriod: 'one-time',
    description: 'A permanent business-grade license with dedicated Safi Sali Companies support.',
    descriptionSo: 'Ruqsad ganacsi oo joogto ah iyo taageero gaar ah oo Safi Sali Companies ah.',
    userLimit: 'Unlimited',
    productLimit: 'Unlimited',
    features: [
      'Lifetime License',
      'Unlimited Users & Products',
      'Full POS & Inventory Management',
      'Advanced Accounting & Financial Ledger',
      'Multi-Currency Support',
      'Unlimited Categories & Invoices',
      'Advanced Reporting & Analytics',
      'Enterprise-Level Access Controls',
      'Database Backup & Cloud Sync (service availability applies)',
      'Dedicated Safi Sali Companies Support',
      'Business-Grade POS & Thermal Printer Integration',
    ],
    featuresSo: [
      'Ruqsad joogto ah',
      'Isticmaalayaal & badeecooyin aan xadidnayn',
      'Maamulka POS & kaydka oo buuxa',
      'Xisaabaad heer sare & diiwaanka maaliyadda',
      'Taageerada lacagaha kala duwan',
      'Qaybo & qaansheegyo aan xadidnayn',
      'Warbixinno heer sare & falanqayn',
      'Xakamaynta gelitaanka heer shirkadeed',
      'Kaydinta xogta & Cloud Sync (waxay ku xiran tahay helitaanka adeegga)',
      'Taageerada Safi Sali Companies',
      'Isku-xirka POS & printer-ka kulaylka',
    ],
    ussdCode: '*712*683723015*7000#',
    badge: 'One-Time Payment',
    badgeSo: 'Hal Mar oo Lacag-bixin ah',
    lifetime: true,
    purchaseUrl: planPurchaseUrls['plan-lifetime'],
  },
];

export const ChoosePlanPage: React.FC = () => {
  const {
    language,
    activeUser,
    showToast,
    license,
    submitLicensePaymentRequest,
    pendingPlanId,
    setPendingPlanId,
    pendingEmployeeCreation,
    setPendingEmployeeCreation,
    setActiveTab,
    refreshLicense,
    t,
  } = useApp();
  const [planCatalog, setPlanCatalog] = useState(plans);
  const [planCatalogLoaded, setPlanCatalogLoaded] = useState(false);
  const [planCatalogError, setPlanCatalogError] = useState('');
  const serverClockAnchor = useRef({ serverTime: Date.now(), monotonicTime: performance.now() });
  const [nowTimeMs, setNowTimeMs] = useState(() => Date.now());
  const [localClockMs, setLocalClockMs] = useState(() => {
    const initialTime = new Date();
    initialTime.setHours(1, 40, 0, 0);
    return initialTime.getTime();
  });
  const localClockAnchor = useRef({ clockTime: localClockMs, monotonicTime: performance.now() });
  const nowTime = new Date(nowTimeMs);
  const [showTrxModal, setShowTrxModal] = useState(false);
  const [activePlan, setActivePlan] = useState<Plan | null>(null);
  const [trxIdInput, setTrxIdInput] = useState('');
  const [isActivating, setIsActivating] = useState(false);

  useEffect(() => {
    document.title = 'Choose Your Plan | SAFI SALI COMPANIES';
  }, []);

  useEffect(() => {
    let mounted = true;
    const token = getStoredAccessToken();
    if (!token) {
      setPlanCatalogError('Sign in again to load current subscription plan settings.');
      setPlanCatalogLoaded(true);
      return () => { mounted = false; };
    }
    getBusinessSubscriptionPlans(token)
      .then(async (serverPlans) => {
        if (!mounted) return;
        const updatedPlans = plans.flatMap((defaultPlan) => {
          const settings = serverPlans.find((serverPlan) => serverPlan.id === defaultPlan.id);
          if (!settings) return [];
          const billingPeriod: Plan['billingPeriod'] = settings.billingPeriod === 'yearly'
            ? 'year'
            : settings.billingPeriod === 'lifetime'
              ? 'one-time'
              : settings.billingPeriod === 'trial'
                ? '365-day free trial'
                : 'month';
          return [{
            ...defaultPlan,
            name: settings.name,
            price: settings.priceUSD,
            durationDays: settings.durationDays,
            billingPeriod,
            userLimit: settings.userLimit === null ? 'Unlimited' : String(settings.userLimit),
            productLimit: settings.productLimit === null ? 'Unlimited' : String(settings.productLimit),
            ussdCode: settings.id === 'plan-trial'
              ? ''
              : `*712*683723015*${settings.priceUSD}#`,
          }];
        });
        if (updatedPlans.length !== plans.length) {
          setPlanCatalogError('The server did not return all six subscription plans.');
          return;
        }
        await refreshLicense();
        if (!mounted) return;
        setPlanCatalog(updatedPlans);
        setPlanCatalogError('');
      })
      .catch((error: unknown) => {
        if (mounted) {
          setPlanCatalogError(error instanceof Error ? error.message : 'Subscription plan settings could not be loaded.');
        }
      })
      .finally(() => {
        if (mounted) setPlanCatalogLoaded(true);
      });
    return () => { mounted = false; };
  }, [refreshLicense]);

  useEffect(() => {
    const serverTime = Date.parse(license.serverTimestamp);
    if (Number.isFinite(serverTime)) {
      serverClockAnchor.current = { serverTime, monotonicTime: performance.now() };
      setNowTimeMs(serverTime);
    }
  }, [license.serverTimestamp]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNowTimeMs(
        serverClockAnchor.current.serverTime +
        performance.now() -
        serverClockAnchor.current.monotonicTime
      );
    }, 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setLocalClockMs(
        localClockAnchor.current.clockTime +
        performance.now() -
        localClockAnchor.current.monotonicTime
      );
    }, 1000);
    return () => window.clearInterval(interval);
  }, []);

  const isTrial = license.planId === 'plan-trial';
  const isPaymentPending = license.pendingPaymentRequest?.status === 'pending';
  const activationTimestamp = parseLicenseTimestamp(license.activationDate);
  const expiryTimestamp = parseLicenseTimestamp(license.expiryDate);
  const effectiveExpiryTimestamp = isTrial && Number.isFinite(activationTimestamp)
    ? activationTimestamp + TRIAL_DURATION_DAYS * 86400000
    : expiryTimestamp;
  const remainingSeconds = Number.isFinite(effectiveExpiryTimestamp)
    ? Math.max(0, Math.ceil((effectiveExpiryTimestamp - nowTime.getTime()) / 1000))
    : 0;
  const countdown = {
    days: Math.floor(remainingSeconds / 86400),
    hours: Math.floor((remainingSeconds % 86400) / 3600),
    minutes: Math.floor((remainingSeconds % 3600) / 60),
    seconds: remainingSeconds % 60,
  };
  const displayCountdown = countdown;
  const isLifetime = license.planId === 'plan-lifetime';
  const showTrialCopy = isTrial && !license.isLocked;
  const totalDays = isLifetime ? 0 : isTrial ? TRIAL_DURATION_DAYS : Math.max(1, license.totalDays);
  const daysRemaining = isLifetime ? 0 : Math.ceil(remainingSeconds / 86400);
  const hoursRemaining = isLifetime ? 0 : Math.ceil(remainingSeconds / 3600);
  const isExpiringSoon = !isLifetime && remainingSeconds > 0 && remainingSeconds <= 7 * 86400;
  const currentDay = isLifetime
    ? 0
    : Math.min(totalDays, Math.max(1, totalDays - daysRemaining + 1));
  const formatCountdownValue = (value: number): string => String(value).padStart(2, '0');

  const openPlan = useCallback((plan: Plan) => {
    if (!planCatalogLoaded || planCatalogError) {
      showToast(planCatalogError || 'Subscription plans are still loading.', 'error');
      return;
    }
    if (plan.id === 'plan-trial') return;
    let purchaseUrl = '';
    if (plan.purchaseUrl) {
      try {
        const parsed = new URL(plan.purchaseUrl);
        if (parsed.protocol !== 'https:') throw new Error('Checkout links must use HTTPS.');
        purchaseUrl = parsed.toString();
      } catch (error) {
        showToast(error instanceof Error ? error.message : 'The configured purchase link is invalid.', 'error');
        return;
      }
    }
    setActivePlan({ ...plan, purchaseUrl });
    setTrxIdInput('');
    setShowTrxModal(true);
  }, [planCatalogError, planCatalogLoaded, showToast]);

  useEffect(() => {
    if (!pendingPlanId) return;
    const selectedPlan = planCatalog.find((plan) => plan.id === pendingPlanId);
    setPendingPlanId(null);
    if (!selectedPlan) {
      showToast('The selected plan could not be found.', 'error');
      return;
    }
    openPlan(selectedPlan);
  }, [openPlan, pendingPlanId, planCatalog, setPendingPlanId, showToast]);

  const handleCancelActivation = () => {
    setShowTrxModal(false);
    setActivePlan(null);
    setTrxIdInput('');
    setPendingEmployeeCreation(false);
  };

  const handleCopyCode = async () => {
    if (!activePlan) return;
    try {
      await navigator.clipboard.writeText(activePlan.ussdCode);
      showToast(
        t('copiedCode').replace('{code}', activePlan.ussdCode),
        'success'
      );
    } catch (error) {
      console.error('Unable to copy USSD code:', error);
      showToast(
        t('copyCodeFailed'),
        'error'
      );
    }
  };

  const handleConfirmActivation = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!activePlan) return;
    if (isPaymentPending) return;
    if (!trxIdInput.trim()) {
      showToast(
        t('enterPaymentTrxId'),
        'error'
      );
      return;
    }

    setIsActivating(true);
    try {
      const success = await submitLicensePaymentRequest(activePlan.id, trxIdInput);
      if (success) {
        setShowTrxModal(false);
        setTrxIdInput('');
        if (pendingEmployeeCreation) {
          setActiveTab('employee');
        }
      }
    } finally {
      setIsActivating(false);
    }
  };

  return (
    <div className="mx-auto w-full min-w-0 max-h-[calc(100dvh-7rem)] max-w-7xl space-y-4 overflow-x-hidden overflow-y-auto overscroll-contain pb-3 sm:space-y-6">
      <header className="relative overflow-hidden rounded-2xl border border-emerald-800 bg-gradient-to-br from-slate-950 via-emerald-950 to-emerald-800 px-5 py-7 text-white shadow-xl shadow-emerald-950/15 sm:rounded-3xl sm:px-9 sm:py-9">
        <div aria-hidden="true" className="absolute -right-16 -top-24 h-64 w-64 rounded-full bg-emerald-400/10 blur-3xl" />
        <div className="relative">
          <div className="flex flex-wrap items-center justify-center gap-2 text-center sm:justify-between sm:text-left">
            <p className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-200 sm:text-xs">
              <ShieldCheck className="h-4 w-4" />
              {t('licenseSecurityAutomation')}
            </p>
            <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-center text-[10px] font-bold tracking-wide text-emerald-50">
              Safi Sali Companies • Enterprise Licensing
            </span>
          </div>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <h1 className="text-center text-3xl font-black leading-tight tracking-tight sm:text-5xl">
              {t('chooseYourPlan')}
            </h1>
            <span className="rounded-full bg-rose-600 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-white shadow-lg shadow-rose-950/25">
              Pro
            </span>
          </div>
          <p className="mx-auto mt-3 max-w-3xl text-center text-sm leading-relaxed text-emerald-100 sm:text-base">
            {t('planIntro')}
          </p>
          <div className="mt-6 grid gap-2 text-xs text-emerald-50 sm:grid-cols-2 lg:grid-cols-4">
            {[
              'realTimeLicenseValidation',
              'automaticTrialCountdown',
              'licenseMonitoring',
              'automaticExpirationDetection',
              'expiredLicenseAutoLock',
              'securePlanActivation',
              'subscriptionStatusTracking',
            ].map((feature) => (
              <span key={feature} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-300" />
                {t(feature)}
              </span>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 border-t border-white/15 pt-4 text-xs sm:justify-start">
            <span className="font-bold text-emerald-100">{t('whatsappSupport')}</span>
            <a className="inline-flex items-center gap-1.5 font-bold text-white transition hover:text-emerald-200" href="https://wa.me/252613078734" target="_blank" rel="noreferrer">
              <MessageCircle className="h-4 w-4 text-emerald-300" />
              +252 61 3078734
            </a>
            <span aria-hidden="true" className="hidden text-emerald-300 sm:inline">•</span>
            <a className="inline-flex items-center gap-1.5 font-bold text-white transition hover:text-emerald-200" href="https://wa.me/252683723015" target="_blank" rel="noreferrer">
              <MessageCircle className="h-4 w-4 text-emerald-300" />
              +252 68 372 3015
            </a>
          </div>
        </div>
      </header>

      <section aria-label="Current license status" className="rounded-2xl border border-emerald-200 bg-white px-3 py-4 shadow-sm dark:border-emerald-900 dark:bg-emerald-950 sm:rounded-3xl sm:px-6 sm:py-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className={`min-w-0 flex-1 space-y-1.5 ${showTrialCopy ? 'text-left' : 'text-center xl:text-left'}`}>
            <p className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
              <Clock className="h-3.5 w-3.5 shrink-0" />
              {t('licenseAutoLockoutMonitor')}
            </p>
            <div className={`flex flex-wrap gap-2 ${showTrialCopy ? 'flex-col items-start' : 'items-center justify-center xl:justify-start'}`}>
              <h2 className="break-words text-xl font-black tracking-tight text-emerald-950 dark:text-white sm:text-2xl">
                {isTrial ? `${t('trial7Day')} (${TRIAL_DURATION_DAYS * 24}h)` : license.planName}
              </h2>
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase ${
                license.isLocked
                  ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300'
              }`}>
                <span className={`h-1.5 w-1.5 rounded-full ${license.isLocked ? 'bg-rose-500' : 'bg-emerald-500'}`} />
                {showTrialCopy
                  ? `${t('day').toUpperCase()} ${currentDay} ${t('of')} ${totalDays} • ${t('activeLicense').toUpperCase()}`
                  : `${isLifetime ? t('lifetime').toUpperCase() : `${t('day').toUpperCase()} ${currentDay} ${t('of')} ${totalDays}`} • ${license.isLocked ? t('lockedLicense').toUpperCase() : t('activeLicense').toUpperCase()}`}
              </span>
            </div>
            <p className="text-xs leading-relaxed text-emerald-700 dark:text-emerald-300">
              {showTrialCopy
                ? `${t('day')} ${currentDay} ${t('of')} ${totalDays} (${hoursRemaining} ${t('hoursRemaining')}) • ${t('licenseCountdown')}.`
                : isLifetime
                ? `${t('lifetimeAccess')} • ${t('licenseStatus')}.`
                : `${t('day')} ${currentDay} ${t('of')} ${totalDays} (${daysRemaining} ${t('daysRemaining')}) • ${t('licenseStatus')}.`}
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2 xl:ml-auto xl:shrink-0">
            <div className="flex flex-col items-center gap-2">
              <div aria-label={t('licenseCountdown')} className="flex items-center gap-1 sm:gap-2">
                {[
                  { label: t('days').toUpperCase(), value: formatCountdownValue(displayCountdown.days) },
                  { label: t('hours').toUpperCase(), value: formatCountdownValue(displayCountdown.hours) },
                  { label: t('mins').toUpperCase(), value: formatCountdownValue(displayCountdown.minutes) },
                  { label: t('secs').toUpperCase(), value: formatCountdownValue(displayCountdown.seconds) },
                ].map(({ label, value }, index) => (
                  <React.Fragment key={label}>
                    <div className="flex h-[60px] min-w-[48px] flex-col items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 px-1.5 dark:border-emerald-900 dark:bg-emerald-900 sm:h-[68px] sm:min-w-[68px] sm:rounded-2xl">
                      <span className="font-mono text-xl font-black leading-none text-emerald-950 dark:text-white sm:text-2xl">
                        {isLifetime ? '--' : value}
                      </span>
                      <span className="mt-1 text-[8px] font-bold tracking-wider text-emerald-600 dark:text-emerald-300">{label}</span>
                    </div>
                    {index < 3 && <span className="font-mono text-xs font-bold text-emerald-400">:</span>}
                  </React.Fragment>
                ))}
              </div>
            </div>
            <div className="flex h-[60px] min-w-[112px] flex-col items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50 px-3 text-center dark:border-emerald-900 dark:bg-emerald-950/40">
              <span className="text-[8px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-300">{t('cycleStatus').toUpperCase()}</span>
              <span className="mt-1 text-xs font-black text-emerald-700 dark:text-emerald-300">
                {isLifetime ? t('lifetime').toUpperCase() : `${t('day')} ${currentDay} ${t('of')} ${totalDays}`}
              </span>
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-col items-center justify-between gap-2 border-t border-emerald-100 pt-3 text-center dark:border-emerald-900 sm:flex-row sm:text-left">
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-[10px] text-emerald-700 dark:text-emerald-300 sm:justify-start">
            <span>
              {t('localTime')}: {new Date(localClockMs).toLocaleTimeString(undefined, {
                hour: 'numeric',
                minute: '2-digit',
                second: '2-digit',
              })}
            </span>
            <span>
              {t('lockAutoLockoutEngine')}: <strong className="text-emerald-700 dark:text-emerald-400">24h × 7 {t('activeMonitor')}</strong>
            </span>
          </div>
        </div>
      </section>

      {license.pendingPaymentRequest?.status === 'rejected' && (
        <section role="status" className="rounded-2xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-950 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-100">
          <p className="font-bold">{t('paymentRejected')}</p>
          <p className="mt-1 text-xs">{t('contactLicensingSupport')}</p>
        </section>
      )}
      {license.pendingPaymentRequest?.status === 'approved' && (
        <section role="status" className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100">
          <p className="font-bold">{t('paymentApproved')}</p>
        </section>
      )}
      {isExpiringSoon && !license.isLocked && (
        <section role="status" className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
          <p className="font-bold">{t('licenseExpiringSoon')}</p>
        </section>
      )}

      <section aria-labelledby="plans-heading" className="space-y-4">
        {planCatalogError && (
          <p role="alert" className="rounded-2xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-900 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
            {planCatalogError}
          </p>
        )}
        <div className="text-center">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-400">{t('professionalPlans')}</p>
          <h2 id="plans-heading" className="mt-1 text-2xl font-black text-slate-950 dark:text-white sm:text-3xl">
            {t('chooseYourPlan')}
          </h2>
          <p className="mt-2 text-xs text-slate-600 dark:text-slate-300 sm:text-sm">
            {t('securePlanDescription')}
          </p>
        </div>
        <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 sm:gap-5">
          {planCatalog.map((plan, index) => (
            <article
              key={plan.id}
              className={`relative flex min-w-0 flex-col rounded-2xl border bg-white p-4 shadow-sm transition duration-200 hover:-translate-y-1 hover:shadow-lg dark:bg-slate-900 sm:rounded-3xl sm:p-5 ${
                plan.popular
                  ? 'border-emerald-500 ring-2 ring-emerald-500/20 shadow-emerald-900/10 dark:border-emerald-400'
                  : 'border-slate-200 dark:border-slate-700'
              }`}
            >
              {plan.popular && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-emerald-600 px-4 py-1 text-[10px] font-black uppercase tracking-wider text-white shadow-md shadow-emerald-900/20">
                  {t('recommended')}
                </span>
              )}
              {plan.badge && (
                <span className={`mb-3 inline-flex w-fit rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wide ${
                  plan.popular
                    ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
                    : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
                }`}>
                  {plan.popular && <Crown className="mr-1 h-3 w-3 text-amber-500" />}
                  {language === 'so' ? plan.badgeSo || plan.badge : plan.badge}
                </span>
              )}
              <div className="flex-1 space-y-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-300">
                    {String(index + 1).padStart(2, '0')} / {String(planCatalog.length).padStart(2, '0')} {t('planCount')}
                  </p>
                  <h3 className="mt-1 break-words text-lg font-black text-slate-950 dark:text-white">
                    {language === 'so' ? plan.nameSo : plan.name}
                  </h3>
                  <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                    {language === 'so' ? plan.descriptionSo : plan.description}
                  </p>
                </div>

                <div className={`rounded-2xl border p-3 ${
                  plan.popular
                    ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/60'
                    : 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60'
                }`}>
                  <p className="text-2xl font-black text-slate-950 dark:text-white">
                            {plan.price === 0 ? t('free') : `$${plan.price.toLocaleString('en-US')}`}
                    <span className="ml-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
                      {plan.billingPeriod === 'month' ? `/ ${t('monthLabel')}` : plan.billingPeriod === 'year' ? `/ ${t('yearLabel')}` : plan.billingPeriod === 'one-time' ? t('oneTime') : ''}
                    </span>
                  </p>
                  <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                    {plan.durationDays === 0 ? `${t('lifetime')} ${t('licenseLabel')}` : `${plan.durationDays} ${t('days')} ${t('licenseLabel')}`}
                  </p>
                  <dl className="mt-3 space-y-1.5 text-xs text-slate-700 dark:text-slate-200">
                    <div className="flex justify-between gap-2">
                      <dt>{t('users')}</dt><dd className="font-bold">{plan.userLimit}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt>{t('products')}</dt><dd className="font-bold">{plan.productLimit}</dd>
                    </div>
                  </dl>
                </div>

                <ul className="space-y-2">
                  {(language === 'so' ? plan.featuresSo : plan.features).map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-[11px] leading-snug text-slate-700 dark:text-slate-200">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-2">
                {plan.id === 'plan-trial' ? (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-center text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                    <span>{t('trialStartsAutomatically')}</span>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => openPlan(plan)}
                    className="flex min-w-0 items-center justify-center gap-2 rounded-2xl bg-slate-900 px-3 py-3 text-xs font-black text-white shadow-lg shadow-slate-950/20 transition hover:bg-slate-800 active:scale-[0.98]"
                    aria-label={`${t('selectPlanLabel')} ${language === 'so' ? plan.nameSo : plan.name}, $${plan.price.toLocaleString('en-US')} ${plan.billingPeriod}`}
                  >
                    <Zap className="h-4 w-4 text-amber-200" />
                    {t('selectPlanLabel')}
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>

      <footer className="rounded-2xl border border-slate-200 bg-slate-950 px-5 py-5 text-center text-white dark:border-slate-800 sm:rounded-3xl sm:px-8">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-300">Safi Sali Companies</p>
        <p className="mt-2 text-sm font-semibold">{t('powerSmarterRetail')}</p>
        <p className="mt-1 text-[11px] text-slate-300">{t('officialLicensingFooter')}</p>
      </footer>

      {showTrxModal && activePlan && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-emerald-950/80 p-2 backdrop-blur-xs sm:items-center sm:p-4">
          <div className="my-auto max-h-[calc(100dvh-1rem)] w-full max-w-lg space-y-4 overflow-y-auto rounded-2xl border border-emerald-200 bg-white p-4 shadow-2xl dark:border-emerald-900 dark:bg-emerald-950 sm:max-h-[calc(100dvh-2rem)] sm:space-y-5 sm:rounded-3xl sm:p-7">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600 dark:bg-emerald-900 dark:text-emerald-300">
                  <Zap className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="break-words font-black text-emerald-950 dark:text-white">
                    {t('activatePlanHeading')} {language === 'so' ? activePlan.nameSo : activePlan.name} (${activePlan.price.toLocaleString('en-US')})
                  </h3>
                  <p className="text-xs text-emerald-700 dark:text-emerald-300">
                    USSD: <span className="break-all font-mono font-bold">{activePlan.ussdCode}</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCancelActivation}
                className="shrink-0 rounded-lg p-2 text-emerald-600 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-900"
                aria-label={t('closeActivationDialog')}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs dark:border-slate-700 dark:bg-slate-900">
              <h4 className="font-black text-slate-900 dark:text-white">{t('confirmSubscription')}</h4>
              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-slate-600 dark:text-slate-300">
                <dt>{t('businessAccount')}</dt>
                <dd className="text-right font-semibold">{AppStore.getSettings().businessName || activeUser.name}</dd>
                <dt>{t('accountOwner')}</dt>
                <dd className="text-right font-semibold">{activeUser.name}</dd>
                <dt>{t('durationLabel')}</dt>
                <dd className="text-right font-semibold">{activePlan.durationDays === 0 ? t('lifetimePeriod') : `${activePlan.durationDays} ${t('days').toLowerCase()}`}</dd>
                <dt>{t('users')}</dt>
                <dd className="text-right font-semibold">{activePlan.userLimit}</dd>
                <dt>{t('products')}</dt>
                <dd className="text-right font-semibold">{activePlan.productLimit}</dd>
              </dl>
            </section>

            <div className="space-y-3 rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-xs dark:border-emerald-800 dark:bg-emerald-900/50">
              <div className="flex items-center justify-between gap-3 border-b border-emerald-200 pb-2 dark:border-emerald-800">
                <span className="flex items-center gap-2 font-bold text-emerald-900 dark:text-emerald-100">
                  <Smartphone className="h-4 w-4 text-emerald-600" />
                  {t('paymentAmount')}
                </span>
                <span className="font-mono text-sm font-black text-emerald-700 dark:text-emerald-300">${activePlan.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD</span>
              </div>
              <p className="leading-relaxed text-emerald-800 dark:text-emerald-200">
                {t('dialPaymentInstructions').replace('{amount}', `$${activePlan.price.toLocaleString('en-US')}`).replace('{phone}', '683723015')}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <a
                  href={isPaymentPending ? undefined : `tel:${activePlan.ussdCode.replace(/#/g, '%23')}`}
                  aria-disabled={isPaymentPending}
                  onClick={(event) => {
                    if (isPaymentPending) event.preventDefault();
                  }}
                  className={`flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-3 py-2.5 text-center font-black text-white hover:bg-emerald-600 ${isPaymentPending ? 'cursor-not-allowed opacity-50' : ''}`}
                >
                  <PhoneCall className="h-4 w-4" /> {t('dialUssd')}
                </a>
                <button
                  type="button"
                  onClick={handleCopyCode}
                  className="flex items-center justify-center gap-2 rounded-xl border border-emerald-300 bg-white px-3 py-2.5 font-bold text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-100"
                >
                  <Copy className="h-4 w-4" /> {t('copyCode')}
                </button>
              </div>
              {activePlan.purchaseUrl && (
                <a
                  href={activePlan.purchaseUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex w-full items-center justify-center rounded-xl border border-emerald-700 px-3 py-2.5 text-center font-black text-emerald-800 hover:bg-emerald-100 dark:text-emerald-200 dark:hover:bg-emerald-900"
                >
                  {t('continueSecureCheckout')}
                </a>
              )}
            </div>

            <form onSubmit={handleConfirmActivation} className="space-y-4">
              <label className="block text-xs font-bold text-emerald-800 dark:text-emerald-200">
                {t('paymentTrxId')}
                <span className="relative mt-1.5 block">
                  <KeyRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-600 dark:text-emerald-300" />
                  <input
                    required
                    type="text"
                    maxLength={120}
                    disabled={isPaymentPending}
                    value={trxIdInput}
                    onChange={(event) => setTrxIdInput(event.target.value)}
                    placeholder={t('exampleTrxId')}
                    className="w-full rounded-xl border border-emerald-300 bg-emerald-50 py-3 pl-9 pr-3 text-xs font-mono font-bold text-emerald-950 placeholder:font-normal placeholder:text-emerald-600 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 dark:border-emerald-800 dark:bg-emerald-900 dark:text-emerald-100 dark:placeholder:text-emerald-400"
                  />
                </span>
              </label>
              <div className="flex flex-wrap justify-end gap-2 border-t border-emerald-100 pt-3 dark:border-emerald-900">
                <button
                  type="button"
                  onClick={handleCancelActivation}
                  className="rounded-xl px-4 py-2.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300"
                >
                  {t('cancel')}
                </button>
                <button
                  type="submit"
                  disabled={!planCatalogLoaded || Boolean(planCatalogError) || isActivating || license.pendingPaymentRequest?.status === 'pending'}
                  className="flex items-center gap-2 rounded-xl bg-emerald-700 px-5 py-2.5 text-xs font-black text-white hover:bg-emerald-600 disabled:cursor-wait disabled:opacity-70"
                >
                  {isActivating
                    ? <><RefreshCw className="h-4 w-4 animate-spin" /> {t('submittingPaymentRequest')}</>
                    : <><Unlock className="h-4 w-4" /> {t('activatePlan')}</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};