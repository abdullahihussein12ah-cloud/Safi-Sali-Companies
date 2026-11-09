import React, { useState } from 'react';
import {
  Settings,
  Building2,
  DollarSign,
  Moon,
  Sun,
  Globe,
  HelpCircle,
  CheckCircle2,
  PhoneCall,
  ExternalLink,
  User,
  Lock,
  Trash2,
  AlertTriangle,
  X,
  Info,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { AppStore, CURRENCY_SYMBOLS } from '../../services/store';
import { CurrencyCode } from '../../types';
import { getCurrencyOptionLabel } from '../../services/currencyRates';
import { clearBusinessData, getStoredAccessToken } from '../../services/api';
import { isBusinessAdministratorRole } from '../../services/permissions';

export const SettingsPage: React.FC = () => {
  const {
    t,
    language,
    setLanguage,
    darkMode,
    toggleDarkMode,
    showToast,
    activeUser,
    license,
    currencyCodes,
    currencyRatesLoading,
    currencyRatesUpdatedAt,
  } = useApp();

  const [activeTab, setSettingsTab] = useState<
    'business' | 'currency' | 'account' | 'security' | 'appearance' | 'support' | 'about'
  >('business');

  const [settings, setSettings] = useState(AppStore.getSettings());
  const canEditBusinessProfile = isBusinessAdministratorRole(activeUser.role);
  const [businessName, setBusinessName] = useState(settings.businessName);
  const [ownerName, setOwnerName] = useState(settings.ownerName);
  const [phone, setPhone] = useState(settings.phone);
  const [email, setEmail] = useState(settings.email);
  const [address, setAddress] = useState(settings.address);
  const [registrationNumber, setRegistrationNumber] = useState(settings.registrationNumber);
  const [receiptFooter, setReceiptFooter] = useState(settings.receiptFooter);

  const [currPass, setCurrPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [showDeleteDataModal, setShowDeleteDataModal] = useState(false);
  const [isDeletingBusinessData, setIsDeletingBusinessData] = useState(false);

  const handleDeleteAllBusinessData = async () => {
    const token = getStoredAccessToken();
    if (!token) {
      showToast('Your secure session has expired. Please sign in again.', 'error');
      return;
    }
    if (!['admin', 'business_owner'].includes(activeUser.role)) return;

    setIsDeletingBusinessData(true);
    try {
      await clearBusinessData(token);
      await AppStore.loadWorkspace(activeUser, token);
      setShowDeleteDataModal(false);
      showToast(
        language === 'so' ? t('businessDataDeletedSomali') : t('settingsDeletedBusinessData'),
        'success'
      );
    } catch (error) {
      showToast(error instanceof Error ? error.message : t('businessDataClearFailed'), 'error');
    } finally {
      setIsDeletingBusinessData(false);
    }
  };

  const handleSaveBusiness = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEditBusinessProfile) return;
    const updated = {
      ...settings,
      businessName,
      ownerName,
      phone,
      email,
      address,
      registrationNumber,
      receiptFooter,
    };
    AppStore.saveSettings(updated);
    setSettings(updated);
    showToast(t('storeSettingsSaved'), 'success');
  };

  const handleCurrencySelect = (code: CurrencyCode) => {
    const updated = { ...settings, currency: code };
    AppStore.saveSettings(updated);
    setSettings(updated);
    showToast(`${t('currencyChanged')} ${code} (${CURRENCY_SYMBOLS[code].symbol})`, 'success');
  };

  const updateFinancialSettings = (updates: Partial<typeof settings>) => {
    if (!canEditBusinessProfile) return;
    const updated = { ...settings, ...updates };
    AppStore.saveSettings(updated);
    setSettings(updated);
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currPass || !newPass) {
      showToast(t('fillPasswordFields'), 'error');
      return;
    }
    if (newPass !== confirmPass) {
      showToast(t('passwordsDoNotMatch'), 'error');
      return;
    }
    setCurrPass('');
    setNewPass('');
    setConfirmPass('');
    showToast(t('passwordUpdated'), 'success');
  };

  return (
    <div className="space-y-6 select-text touch-pan-y">
      <div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          {t('settingsDescription')}
        </p>
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        <div className="w-full md:w-56 shrink-0 space-y-1">
          {[
            { id: 'business', label: t('settingsBusiness'), icon: Building2 },
            { id: 'currency', label: t('settingsCurrency'), icon: DollarSign },
            { id: 'account', label: t('settingsAccount'), icon: User },
            { id: 'appearance', label: t('settingsAppearance'), icon: Globe },
            { id: 'security', label: t('settingsSecurity'), icon: Lock },
            { id: 'support', label: t('navSupport'), icon: HelpCircle },
            { id: 'about', label: t('settingsAbout'), icon: Info },
          ].map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setSettingsTab(tab.id as any)}
                className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl text-xs font-bold transition cursor-pointer ${
                  activeTab === tab.id
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex-1 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 shadow-xs">
          {/* Business Profile */}
          {activeTab === 'business' && (
            <form onSubmit={handleSaveBusiness} className="space-y-4">
              {!canEditBusinessProfile && (
                <p className="text-xs text-amber-700 dark:text-amber-300">{t('businessProfileOwnerOnly')}</p>
              )}
              <fieldset disabled={!canEditBusinessProfile} className="m-0 min-w-0 space-y-4 border-0 p-0 text-xs disabled:opacity-70">
              <h3 className="font-bold text-sm text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-2">
                {t('storeInformationReceiptHeader')}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {t('storeBusinessName')}
                  </label>
                  <input
                    type="text"
                    required
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-bold"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {t('ownerManagerName')}
                  </label>
                  <input
                    type="text"
                    value={ownerName}
                    onChange={(e) => setOwnerName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {t('telephoneWhatsapp')}
                  </label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {t('contactEmail')}
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {t('storeAddress')}
                </label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {t('taxRegistrationId')}
                </label>
                <input
                  type="text"
                  value={registrationNumber}
                  onChange={(e) => setRegistrationNumber(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono"
                />
              </div>

              <section className="space-y-4 border-t border-slate-100 dark:border-slate-800 pt-4">
                <div>
                  <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                    {t('taxesAndProductInsuranceRates')}
                  </h3>
                  <p className="mt-0.5 text-xs text-slate-500">{t('taxInsuranceSettingsDescription')}</p>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/50 p-4 space-y-3">
                    <label className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-100">
                      <input
                        type="checkbox"
                        checked={settings.taxEnabled}
                        onChange={(event) => updateFinancialSettings({ taxEnabled: event.target.checked })}
                        className="h-3.5 w-3.5 rounded text-emerald-600 focus:ring-emerald-500"
                      />
                      {t('enableSalesTaxCalculation')}
                    </label>
                    <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={settings.taxRate}
                        onChange={(event) => updateFinancialSettings({ taxRate: Math.max(0, Number(event.target.value) || 0) })}
                        className="w-20 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2.5 py-2 font-mono font-semibold text-slate-800 dark:text-slate-100"
                        aria-label={t('salesTaxRate')}
                      />
                      <span>% {t('salesTaxRate')}</span>
                    </label>
                  </section>
                  <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/50 p-4 space-y-3">
                    <label className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-100">
                      <input
                        type="checkbox"
                        checked={settings.goodsInsuranceEnabled}
                        onChange={(event) => updateFinancialSettings({ goodsInsuranceEnabled: event.target.checked })}
                        className="h-3.5 w-3.5 rounded text-emerald-600 focus:ring-emerald-500"
                      />
                      {t('enableGoodsInsuranceRate')}
                    </label>
                    <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={settings.goodsInsuranceRate}
                        onChange={(event) => updateFinancialSettings({ goodsInsuranceRate: Math.max(0, Number(event.target.value) || 0) })}
                        className="w-20 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2.5 py-2 font-mono font-semibold text-slate-800 dark:text-slate-100"
                        aria-label={t('goodsInsurance')}
                      />
                      <span>% {t('goodsInsurance')}</span>
                    </label>
                  </section>
                </div>
              </section>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {t('receiptFooterMessage')}
                </label>
                <textarea
                  rows={2}
                  value={receiptFooter}
                  onChange={(e) => setReceiptFooter(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                />
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm"
                >
                  {t('saveBusinessProfile')}
                </button>
              </div>
              </fieldset>
            </form>
          )}

          {/* Currency Configuration */}
          {activeTab === 'currency' && (
            <div className="space-y-4">
              <div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">{t('regionalCurrencyConfiguration')}</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {t('selectDefaultCurrencyDescription')}
                </p>
              </div>
              <div className="max-w-xl pt-2">
                <label htmlFor="base-currency" className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  {t('selectBaseCurrency')}
                </label>
                <select
                  id="base-currency"
                  value={settings.currency}
                  onChange={(event) => handleCurrencySelect(event.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                >
                  {currencyCodes.map((code) => (
                    <option key={code} value={code}>
                      {getCurrencyOptionLabel(code, language)}
                    </option>
                  ))}
                </select>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                  <span>{currencyCodes.length} {t('supportedCurrencies')}</span>
                  {currencyRatesLoading && <span>{t('updatingCurrencyRates')}</span>}
                  {currencyRatesUpdatedAt && (
                    <span>
                      {t('currencyRatesUpdated')}: {new Date(currencyRatesUpdatedAt).toLocaleDateString(language)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Account & Plan */}
          {activeTab === 'account' && (
            <div className="space-y-4 text-xs">
              <h3 className="font-bold text-sm text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-2">
                {t('accountCredentialsCurrentAccess')}
              </h3>
              <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 uppercase font-semibold text-[10px]">{t('activeUser')}</span>
                  <span className="font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 uppercase text-[10px]">
                    {t(activeUser.role)}
                  </span>
                </div>
                <div className="text-sm font-bold text-slate-900 dark:text-white">
                  {activeUser.name === 'Maqsuud Administrator' ? 'Safi Sali Companies Administrator' : activeUser.name}
                </div>
                <div className="text-slate-500 font-mono">{activeUser.email}</div>
              </div>

              <div className="p-4 border border-emerald-500/30 bg-emerald-50/30 dark:bg-emerald-950/20 rounded-2xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-emerald-700 dark:text-emerald-300">
                    {t('operatingAccessState')}
                  </span>
                  <span className="font-black px-2.5 py-0.5 rounded-full bg-emerald-600 text-white text-[10px]">
                    {license.planId === 'plan-lifetime'
                      ? `${license.status}: LIFETIME`
                      : `${license.status}: DAY ${license.currentDay}/${license.totalDays}`}
                  </span>
                </div>
                <p className="text-slate-600 dark:text-slate-300">
                  {license.planName} · USSD: <span className="font-mono font-bold text-emerald-600">{license.activeUssdCode}</span>
                </p>
              </div>
            </div>
          )}

          {/* Theme & Language */}
          {activeTab === 'appearance' && (
            <div className="space-y-6">
              <div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-white mb-1">{t('languageSelection')}</h3>
                <p className="text-xs text-slate-500 mb-3">{t('chooseInterfaceLanguage')}</p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setLanguage('en')}
                    className={`px-4 py-2.5 rounded-2xl text-xs font-bold border transition cursor-pointer ${
                      language === 'en'
                        ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                        : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {t('englishUsUk')}
                  </button>
                  <button
                    onClick={() => setLanguage('so')}
                    className={`px-4 py-2.5 rounded-2xl text-xs font-bold border transition cursor-pointer ${
                      language === 'so'
                        ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                        : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {t('somaliLanguage')}
                  </button>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
                <h3 className="font-bold text-sm text-slate-900 dark:text-white mb-1">{t('colorTheme')}</h3>
                <p className="text-xs text-slate-500 mb-3">{t('toggleDarkLightMode')}</p>
                <div className="flex gap-3">
                  <button
                    onClick={() => !darkMode && toggleDarkMode()}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold border transition cursor-pointer ${
                      darkMode
                        ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                        : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <Moon className="w-4 h-4" /> {t('darkMode')}
                  </button>
                  <button
                    onClick={() => darkMode && toggleDarkMode()}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold border transition cursor-pointer ${
                      !darkMode
                        ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                        : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <Sun className="w-4 h-4" /> {t('lightMode')}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Password & Security */}
          {activeTab === 'security' && (
            <form onSubmit={handlePasswordSubmit} className="space-y-4 max-w-md text-xs">
              <h3 className="font-bold text-sm text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-2">
                {t('updateOperationalPassword')}
              </h3>
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {t('currentPassword')}
                </label>
                <input
                  type="password"
                  required
                  value={currPass}
                  onChange={(e) => setCurrPass(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {t('newPassword')}
                </label>
                <input
                  type="password"
                  required
                  value={newPass}
                  onChange={(e) => setNewPass(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {t('confirmNewPassword')}
                </label>
                <input
                  type="password"
                  required
                  value={confirmPass}
                  onChange={(e) => setConfirmPass(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                />
              </div>
              <button
                type="submit"
                className="px-5 py-2.5 rounded-xl font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm"
              >
                {t('changePassword')}
              </button>
            </form>
          )}

          {/* Support & Info */}
          {activeTab === 'support' && (
            <div className="space-y-5">
              <h3 className="font-bold text-sm text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-2">
                {t('navSupport')} — {t('officialSupportChannels')}
              </h3>
              <div className="space-y-3">
                <a
                  href="https://wa.me/252683723015"
                  target="_blank"
                  rel="noreferrer"
                  className="p-4 rounded-2xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20 flex items-center justify-between hover:border-emerald-500 transition group"
                >
                  <div className="flex items-center gap-3">
                    <PhoneCall className="w-6 h-6 shrink-0 text-emerald-600" />
                    <div>
                      <div className="font-bold text-xs text-slate-900 dark:text-white">
                        {t('directWhatsappSupport')}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {t('chatTechnicalEngineers')}
                      </div>
                    </div>
                  </div>
                  <ExternalLink className="w-4 h-4 text-emerald-600" />
                </a>

                {/* Clear all business data section */}
                {['admin', 'business_owner'].includes(activeUser.role) && (
                  <div className="pt-4 border-t border-rose-200 dark:border-rose-900/60 space-y-3">
                    <div className="p-4 rounded-2xl border border-rose-200 dark:border-rose-900/70 bg-rose-50/60 dark:bg-rose-950/30 space-y-2.5">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-rose-100 dark:bg-rose-900/50 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                          <Trash2 className="w-4 h-4" />
                        </div>
                        <h4 className="font-bold text-sm text-rose-700 dark:text-rose-300">
                          {t('clearAllBusinessData')}
                        </h4>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                        {t('deleteBusinessDataWarning')}
                      </p>
                      <div className="pt-1">
                        <button
                          type="button"
                          onClick={() => setShowDeleteDataModal(true)}
                          className="px-4 py-2.5 rounded-xl text-xs font-black bg-rose-600 hover:bg-rose-500 text-white shadow-md shadow-rose-600/20 flex items-center gap-2 transition active:scale-95 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                          <span>{t('clearAllBusinessData')}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* About Safi Sali Companies */}
          {activeTab === 'about' && (
            <article className="max-w-3xl space-y-6 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              <header className="space-y-2 border-b border-slate-100 pb-4 dark:border-slate-800">
                <p className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                  {t('aboutUs')}
                </p>
                <h2 className="text-xl font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-2xl">
                  {t('aboutCompanyTagline')}
                </h2>
              </header>

              <section className="space-y-3">
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                  {t('aboutWhoWeAre')}
                </h3>
                <p>
                  {t('aboutDescriptionOne')}
                </p>
                <p>
                  {t('aboutDescriptionTwo')}
                </p>
                <p>
                  {t('aboutDescriptionThree')}
                </p>
              </section>

              <section className="space-y-3">
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                  {t('aboutWhatWeDo')}
                </h3>
                <p>{t('aboutWhatWeDoDescription')}</p>
                <ul className="list-disc space-y-2 pl-5 marker:text-emerald-600 dark:marker:text-emerald-400">
                  <li>{t('aboutWebsiteDevelopment')}</li>
                  <li>{t('aboutSoftwareDevelopment')}</li>
                  <li>{t('aboutBusinessSystems')}</li>
                  <li>{t('aboutMobileApps')}</li>
                  <li>{t('aboutITSupport')}</li>
                  <li>{t('aboutDigitalTransformation')}</li>
                </ul>
              </section>

              <section className="space-y-3">
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                  {t('aboutWhoWeServe')}
                </h3>
                <p>{t('aboutWhoWeServeDescription')}</p>
              </section>

              <section className="space-y-3">
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                  {t('aboutOurMission')}
                </h3>
                <p>{t('aboutOurMissionDescription')}</p>
              </section>

              <section className="space-y-3">
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                  {t('aboutOurVision')}
                </h3>
                <p>{t('aboutOurVisionDescription')}</p>
              </section>

              <section className="space-y-3">
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                  {t('aboutWhyChoose')}
                </h3>
                <ul className="list-disc space-y-2 pl-5 marker:text-emerald-600 dark:marker:text-emerald-400">
                  <li>{t('aboutInnovation')}</li>
                  <li>{t('aboutQuality')}</li>
                  <li>{t('aboutCustomerSatisfaction')}</li>
                  <li>{t('aboutAffordableSolutions')}</li>
                  <li>{t('aboutCustomizedServices')}</li>
                  <li>{t('aboutLongTermPartnership')}</li>
                </ul>
              </section>

              <section className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-900 dark:bg-emerald-950/30">
                <h3 className="text-base font-extrabold text-emerald-800 dark:text-emerald-300">
                  {t('aboutOurCommitment')}
                </h3>
                <p className="text-emerald-900 dark:text-emerald-200">{t('aboutOurCommitmentDescription')}</p>
              </section>
            </article>
          )}
        </div>
      </div>

      {/* Confirmation Modal for Clearing All Business Data */}
      {showDeleteDataModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 border border-rose-300 dark:border-rose-900 rounded-3xl w-full max-w-lg shadow-2xl p-6 sm:p-7 space-y-5">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-6 h-6 stroke-[2.5]" />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 dark:text-white text-base">
                    {t('clearAllBusinessData')}
                  </h3>
                  <p className="text-xs text-rose-600 dark:text-rose-400 font-semibold">
                    {t('deleteDataWarning')}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowDeleteDataModal(false);
                }}
                disabled={isDeletingBusinessData}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60 text-xs text-rose-800 dark:text-rose-200 leading-relaxed">
              {t('deleteBusinessDataWarning')}
            </div>
            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setShowDeleteDataModal(false);
                }}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                disabled={isDeletingBusinessData}
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                onClick={() => void handleDeleteAllBusinessData()}
                disabled={isDeletingBusinessData}
                className="px-5 py-2.5 rounded-xl text-xs font-black bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/30 flex items-center gap-2 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                <span>{isDeletingBusinessData ? t('clearingBusinessData') : t('clearAllBusinessData')}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
