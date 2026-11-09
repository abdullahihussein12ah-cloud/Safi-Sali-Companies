import React, { useEffect, useState } from 'react';
import {
  Lock,
  Unlock,
  Copy,
  CheckCircle2,
  KeyRound,
  Smartphone,
  RefreshCw,
  X,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { getBusinessSubscriptionPlans, getStoredAccessToken } from '../../services/api';

const planPurchaseUrls: Record<string, string> = {
  'plan-basic': import.meta.env.VITE_PLAN_BASIC_PURCHASE_URL?.trim() || '',
  'plan-professional': import.meta.env.VITE_PLAN_PROFESSIONAL_PURCHASE_URL?.trim() || '',
  'plan-enterprise': import.meta.env.VITE_PLAN_ENTERPRISE_PURCHASE_URL?.trim() || '',
  'plan-annual': import.meta.env.VITE_PLAN_ANNUAL_PURCHASE_URL?.trim() || '',
  'plan-lifetime': import.meta.env.VITE_PLAN_LIFETIME_PURCHASE_URL?.trim() || '',
};

type PaidPlan = {
  id: string;
  name: string;
  nameSo: string;
  price: number;
  durationDays: number;
  userLimit: number | null;
  productLimit: number | null;
  purchaseUrl: string;
};

const defaultPaidPlans: PaidPlan[] = [
  { id: 'plan-basic', name: 'Basic Retail Plan', nameSo: 'Qorshaha Tafaariiqda Aasaasiga ah', price: 3, durationDays: 30, userLimit: 3, productLimit: 500, purchaseUrl: planPurchaseUrls['plan-basic'] },
  { id: 'plan-professional', name: 'Professional Business Plan', nameSo: 'Qorshaha Ganacsi ee Xirfadaysan', price: 5, durationDays: 30, userLimit: 10, productLimit: null, purchaseUrl: planPurchaseUrls['plan-professional'] },
  { id: 'plan-enterprise', name: 'Enterprise Wholesaler Plan', nameSo: 'Qorshaha Jumladleyda Ganacsiga Weyn', price: 30, durationDays: 30, userLimit: null, productLimit: null, purchaseUrl: planPurchaseUrls['plan-enterprise'] },
  { id: 'plan-annual', name: 'Annual Enterprise Plan', nameSo: 'Qorshaha Sannadlaha ah ee Ganacsiga Weyn', price: 360, durationDays: 365, userLimit: null, productLimit: null, purchaseUrl: planPurchaseUrls['plan-annual'] },
  { id: 'plan-lifetime', name: 'Lifetime Enterprise Plan', nameSo: 'Qorshaha Ganacsiga Weyn ee Joogtada ah', price: 7000, durationDays: 0, userLimit: null, productLimit: null, purchaseUrl: planPurchaseUrls['plan-lifetime'] },
];

const getSecureCheckoutUrl = (value: string): string => {
  if (!value) return '';
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : '';
  } catch {
    return '';
  }
};

export const SystemLockModal: React.FC = () => {
  const { language, license, submitLicensePaymentRequest, refreshLicense, showToast, t, logout } = useApp();
  const [trxId, setTrxId] = useState('');
  const [copied, setCopied] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState('plan-professional');
  const [refreshError, setRefreshError] = useState('');
  const [paidPlans, setPaidPlans] = useState<PaidPlan[]>(defaultPaidPlans);
  const [planCatalogLoaded, setPlanCatalogLoaded] = useState(false);
  const [planCatalogError, setPlanCatalogError] = useState('');

  useEffect(() => {
    let mounted = true;
    const token = getStoredAccessToken();
    if (!token) {
      setPlanCatalogError('Sign in again to load current subscription plan settings.');
      setPlanCatalogLoaded(true);
      return () => { mounted = false; };
    }
    getBusinessSubscriptionPlans(token)
      .then((serverPlans) => {
        if (!mounted) return;
        const mappedPlans = defaultPaidPlans.flatMap((defaultPlan) => {
          const settings = serverPlans.find((plan) => plan.id === defaultPlan.id);
          return settings
            ? [{
                ...defaultPlan,
                name: settings.name,
                price: settings.priceUSD,
                durationDays: settings.durationDays,
                userLimit: settings.userLimit,
                productLimit: settings.productLimit,
              }]
            : [];
        });
        if (mappedPlans.length !== defaultPaidPlans.length) {
          setPlanCatalogError('The server did not return all five paid subscription plans.');
          return;
        }
        setPaidPlans(mappedPlans);
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
  }, []);

  const isPaymentPending = license.pendingPaymentRequest?.status === 'pending';
  const effectivePlanId = isPaymentPending ? license.pendingPaymentRequest?.planId : selectedPlanId;
  const selectedPlan = paidPlans.find((plan) => plan.id === effectivePlanId) || paidPlans[1];
  const ussdCode = `*712*683723015*${selectedPlan.price}#`;
  const phone = license.ussdPhone || '683723015';
  const trialHasExpired = license.planId === 'plan-trial' && license.status === 'EXPIRED';
  const checkoutUrl = getSecureCheckoutUrl(selectedPlan.purchaseUrl);
  const hasInvalidCheckoutUrl = Boolean(selectedPlan.purchaseUrl) && !checkoutUrl;

  useEffect(() => {
    if (!isPaymentPending) return;
    const intervalId = window.setInterval(() => {
      void refreshLicense()
        .then(() => setRefreshError(''))
        .catch((error: unknown) => {
          console.error('Unable to refresh the pending license status:', error);
          setRefreshError(error instanceof Error ? error.message : 'License status could not be refreshed.');
        });
    }, 15000);
    return () => window.clearInterval(intervalId);
  }, [isPaymentPending, refreshLicense]);

  if (!license.isLocked) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(ussdCode);
    setCopied(true);
    showToast(
      t('copiedCode').replace('{code}', ussdCode),
      'success'
    );
    setTimeout(() => setCopied(false), 3000);
  };

  const handleSubmitPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!planCatalogLoaded || planCatalogError) {
      showToast(planCatalogError || 'Subscription plans are still loading.', 'error');
      return;
    }
    if (!trxId.trim()) {
      showToast(
        t('enterPaymentTrxId'),
        'error'
      );
      return;
    }
    setIsVerifying(true);
    try {
      const submitted = await submitLicensePaymentRequest(selectedPlan.id, trxId);
      if (submitted) setTrxId('');
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/85 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-md animate-in fade-in sm:items-center sm:p-4">
      <div className="relative my-auto max-h-[calc(100dvh-1.5rem)] w-full max-w-lg space-y-5 overflow-y-auto rounded-3xl border-2 border-rose-500/80 bg-white p-4 text-slate-900 shadow-2xl dark:border-rose-600 dark:bg-slate-900 dark:text-white sm:max-h-[calc(100dvh-2rem)] sm:p-7">
        <button
          type="button"
          onClick={logout}
          aria-label={t('logout')}
          title={t('logout')}
          className="absolute right-2 top-2 z-10 flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white sm:right-3 sm:top-3"
        >
          <X className="h-5 w-5" />
        </button>
        {/* Subtle lock background glow */}
        <div className="absolute -top-16 -right-16 w-48 h-48 bg-rose-500/10 rounded-full blur-2xl pointer-events-none" />

        {/* Lock Header */}
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="w-16 h-16 rounded-3xl bg-rose-100 dark:bg-rose-950/70 border-2 border-rose-500 text-rose-600 dark:text-rose-400 flex items-center justify-center shadow-lg shadow-rose-600/20 animate-pulse">
            <Lock className="w-8 h-8 stroke-[2.5]" />
          </div>
          <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-500 text-white">
            <span>{t('lockedSystemBanner')}</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black tracking-tight">
            {t('professionalPlans')}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md leading-relaxed">
            {t('chooseYourPlan')}
          </p>
        </div>

        {trialHasExpired && (
          <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
            {t('trialExpiredPaymentInstructions')}
          </p>
        )}
        {license.pendingPaymentRequest?.status === 'rejected' && (
          <p role="status" className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs leading-relaxed text-rose-900 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
            {t('paymentRejected')} {t('contactLicensingSupport')}
          </p>
        )}
        {planCatalogError && (
          <p role="alert" className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
            {planCatalogError}
          </p>
        )}

        <div className="grid items-end gap-3 sm:grid-cols-[1.2fr_0.8fr]">
          <label className="block space-y-1.5 text-left text-xs font-bold text-slate-700 dark:text-slate-200">
            {t('chooseYourPlan')}
            <select
              value={selectedPlanId}
              onChange={(event) => setSelectedPlanId(event.target.value)}
              disabled={!planCatalogLoaded || Boolean(planCatalogError) || isPaymentPending}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            >
              {paidPlans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {language === 'so' ? plan.nameSo : plan.name} · ${plan.price.toLocaleString('en-US')} · {plan.durationDays === 0 ? t('lifetimePeriod') : `${plan.durationDays} ${t('days').toLowerCase()}`}
                </option>
              ))}
            </select>
          </label>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 dark:border-emerald-900 dark:bg-emerald-950/40">
            <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
              {t('paymentAmount')}
            </p>
            <p className="mt-1 text-sm font-black text-emerald-800 dark:text-emerald-200">
              ${selectedPlan.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
              <span className="ml-1 text-[10px] font-semibold">
                / {selectedPlan.durationDays === 0 ? t('lifetimePeriod') : `${selectedPlan.durationDays} ${t('days').toLowerCase()}`}
              </span>
            </p>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-x-3 gap-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs dark:border-slate-700 dark:bg-slate-800/60">
          <dt className="text-slate-500 dark:text-slate-400">{t('users')}</dt>
          <dd className="text-right font-bold">{selectedPlan.userLimit ?? 'Unlimited'}</dd>
          <dt className="text-slate-500 dark:text-slate-400">{t('products')}</dt>
          <dd className="text-right font-bold">{selectedPlan.productLimit ?? 'Unlimited'}</dd>
        </dl>

        {/* USSD Direct Transfer Card */}
        <div className="p-4 rounded-2xl bg-gradient-to-br from-rose-50 via-slate-50 to-emerald-50 dark:from-rose-950/30 dark:via-slate-800/80 dark:to-emerald-950/20 border border-slate-200 dark:border-slate-700 space-y-3 text-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-200">
              <Smartphone className="w-4 h-4 text-emerald-500" />
              <span>{t('paymentTransferInstructions')}</span>
            </div>
          </div>

          {/* Number & Code Highlight */}
          <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 space-y-1">
            <div className="text-[11px] text-slate-500 flex justify-between">
              <span>{t('sendToNumber')}</span>
              <span className="font-bold text-slate-900 dark:text-white font-mono">{phone}</span>
            </div>
            <div className="text-[11px] text-slate-500 flex justify-between">
              <span>{t('directUssdCode')}</span>
              <span className="font-black text-emerald-600 font-mono text-xs">{ussdCode}</span>
            </div>
          </div>

          {/* Copy Number & USSD Buttons */}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              type="button"
              onClick={handleCopy}
              className="py-2.5 px-3 rounded-xl font-black text-xs bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/30 transition transform active:scale-95"
            >
              {copied ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{t('copied')}</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>{t('copyUssdCode')}</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(phone);
                showToast(`Lambarka "${phone}" waa la koobiyeeyey!`, 'success');
              }}
              className="py-2.5 px-3 rounded-xl font-bold text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 hover:border-emerald-500 flex items-center justify-center gap-1.5 transition"
            >
              <Copy className="w-3.5 h-3.5 text-slate-400" />
              <span>{t('copyPhoneNumber').replace('{phone}', phone)}</span>
            </button>
          </div>
          {checkoutUrl && (
            <a
              href={checkoutUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex w-full items-center justify-center rounded-xl border border-emerald-700 px-3 py-2.5 text-center font-black text-emerald-800 hover:bg-emerald-100 dark:text-emerald-200 dark:hover:bg-emerald-900"
            >
              {t('continueSecureCheckout')}
            </a>
          )}
          {hasInvalidCheckoutUrl && (
            <p role="alert" className="text-rose-700 dark:text-rose-300">
              {t('checkoutLinkInvalid')}
            </p>
          )}
        </div>

        {!isPaymentPending && (
          <form onSubmit={handleSubmitPayment} className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                {t('enterPaymentSmsTrxId')}
              </label>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  maxLength={120}
                  value={trxId}
                  onChange={(e) => setTrxId(e.target.value)}
                  disabled={isVerifying}
                  placeholder={t('trxPlaceholder')}
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl text-xs font-mono font-bold bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 uppercase placeholder:normal-case placeholder:font-normal focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-2 pt-1">
              <button
                type="submit"
                disabled={!planCatalogLoaded || Boolean(planCatalogError) || isVerifying || isPaymentPending}
                className="w-full sm:flex-1 py-3 rounded-xl font-black text-xs bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2 transition transform active:scale-95"
              >
                {isVerifying ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>{t('submittingPaymentRequest')}</span>
                  </>
                ) : (
                  <>
                    <Unlock className="w-4 h-4" />
                    <span>{t('submitPaymentForVerification')}</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        <div className="text-center text-[10px] text-slate-400 font-mono">
          {t('paymentVerificationRequired')}
        </div>
      </div>
    </div>
  );
};
