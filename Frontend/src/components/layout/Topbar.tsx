import React, { useEffect, useRef, useState } from 'react';
import {
  Menu,
  Moon,
  Sun,
  Globe2,
  Wifi,
  WifiOff,
  Search,
  ShoppingCart,
  QrCode,
  CircleDollarSign,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { CurrencyCode } from '../../types';
import { AppStore, CURRENCY_SYMBOLS } from '../../services/store';
import { getCurrencyOptionLabel } from '../../services/currencyRates';

interface TopbarProps {
  onToggleSidebar: () => void;
  onToggleCollapse: () => void;
  collapsed: boolean;
}

export const Topbar: React.FC<TopbarProps> = ({
  onToggleSidebar,
  onToggleCollapse,
  collapsed,
}) => {
  const {
    language,
    setLanguage,
    darkMode,
    toggleDarkMode,
    activeUser,
    activeTab,
    isOffline,
    setActiveTab,
    t,
    currencyCodes,
    currencyRatesLoading,
    currencyRatesUpdatedAt,
  } = useApp();

  const [currencyMenuOpen, setCurrencyMenuOpen] = useState(false);
  const [currencySearch, setCurrencySearch] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const settings = AppStore.getSettings();

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', focusSearch);
    return () => window.removeEventListener('keydown', focusSearch);
  }, []);

  const handleCurrencyChange = (code: CurrencyCode) => {
    AppStore.saveSettings({ ...settings, currency: code });
    setCurrencyMenuOpen(false);
  };

  return (
    <header className="sticky top-0 z-30 flex h-[calc(4rem+env(safe-area-inset-top))] w-full min-w-0 shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-white pt-[env(safe-area-inset-top)] pl-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))] transition-colors dark:border-slate-800 dark:bg-slate-900 sm:gap-3 sm:px-4 lg:px-6">
      {/* Left: Mobile hamburger + desktop collapse */}
      <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-4">
        <button
          onClick={onToggleSidebar}
          className="lg:hidden min-h-10 min-w-10 flex items-center justify-center rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          aria-label={t('toggleNavigation')}
        >
          <Menu className="w-5 h-5" />
        </button>

        <button
          onClick={onToggleCollapse}
          className="hidden lg:flex p-2 rounded-lg text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          title={collapsed ? t('expandSidebar') : t('collapseSidebar')}
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Global Quick Search */}
        <div className="relative hidden min-w-0 flex-1 md:block md:max-w-[392px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            ref={searchInputRef}
            type="text"
            placeholder={t('globalSearch')}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                setActiveTab('products');
              }
            }}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-10 text-xs text-slate-900 transition placeholder:text-slate-400 focus:border-emerald-500 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          />
          <kbd className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-400 shadow-xs xl:block dark:border-slate-700 dark:bg-slate-900">
            ⌘ K
          </kbd>
        </div>
      </div>

      {/* Right Controls */}
      <div className="flex shrink-0 items-center gap-1 sm:gap-1.5 xl:gap-2">
        {['admin', 'manager', 'cashier'].includes(activeUser.role) && (
          <>
            <button
              type="button"
              onClick={() => setActiveTab('pos')}
              aria-label={t('posTerminal')}
              aria-current={activeTab === 'pos' ? 'page' : undefined}
              className={`hidden h-9 items-center justify-center gap-1.5 rounded-xl px-2 text-[11px] font-bold text-white shadow-sm transition md:flex sm:px-2.5 xl:min-w-[146px] xl:px-3 ${
                activeTab === 'pos'
                  ? 'bg-emerald-700 ring-2 ring-emerald-300 dark:ring-emerald-800'
                  : 'bg-emerald-600 hover:bg-emerald-500'
              }`}
            >
              <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-emerald-200" />
              <ShoppingCart className="h-4 w-4 shrink-0" />
              <span className="hidden min-[1200px]:inline">{t('posTerminal')}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('scanner')}
              aria-label={t('scanQR')}
              aria-current={activeTab === 'scanner' ? 'page' : undefined}
              className="hidden h-9 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-2 text-[11px] font-bold text-slate-700 transition hover:bg-slate-100 md:flex sm:px-2.5 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <QrCode className="h-4 w-4 shrink-0 text-emerald-600" />
              <span className="hidden min-[1200px]:inline">{t('scanQR')}</span>
            </button>
          </>
        )}

        {/* Currency Selector */}
        <div className="relative">
          <button
            onClick={() => setCurrencyMenuOpen(!currencyMenuOpen)}
            aria-label={`Currency: ${settings.currency}`}
            className="flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 sm:px-2.5"
          >
            <CircleDollarSign className="h-3.5 w-3.5 text-emerald-600" />
            <span>{CURRENCY_SYMBOLS[settings.currency]?.symbol || settings.currency} {settings.currency}</span>
          </button>

          {currencyMenuOpen && (
            <div className="absolute right-0 mt-2 w-72 max-w-[calc(100vw-1rem)] bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 py-1.5 z-50">
              <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                {t('selectBaseCurrency')}
              </div>
              <div className="px-2 pb-2">
                <input
                  type="search"
                  value={currencySearch}
                  onChange={(event) => setCurrencySearch(event.target.value)}
                  placeholder={t('searchCurrencies')}
                  aria-label={t('searchCurrencies')}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs text-slate-800 outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>
              <div className="max-h-[min(60vh,28rem)] overflow-y-auto">
              {currencyRatesLoading && !currencyRatesUpdatedAt && (
                <p className="px-3 py-2 text-xs text-slate-500">{t('updatingCurrencyRates')}</p>
              )}
              {currencyCodes
                .filter((code) => {
                  const query = currencySearch.trim().toLowerCase();
                  return !query || code.toLowerCase().includes(query) || CURRENCY_SYMBOLS[code].name.toLowerCase().includes(query);
                })
                .map((code) => (
                <button
                  key={code}
                  onClick={() => {
                    handleCurrencyChange(code);
                    setCurrencyMenuOpen(false);
                    setCurrencySearch('');
                  }}
                  className={`w-full px-3 py-2 text-xs flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-700/50 ${
                    settings.currency === code
                      ? 'text-emerald-600 font-bold bg-emerald-50/50 dark:bg-emerald-950/30'
                      : 'text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <span className="truncate pr-2 text-left">{getCurrencyOptionLabel(code, language)}</span>
                </button>
              ))}
              {currencyCodes.length > 0 && currencyCodes.every((code) => {
                const query = currencySearch.trim().toLowerCase();
                return query && !code.toLowerCase().includes(query) && !CURRENCY_SYMBOLS[code].name.toLowerCase().includes(query);
              }) && (
                <p className="px-3 py-2 text-xs text-slate-500">{t('noResults')}</p>
              )}
              </div>
              {currencyRatesUpdatedAt && (
                <p className="border-t border-slate-100 px-3 pt-2 text-[10px] text-slate-400 dark:border-slate-700">
                  {t('currencyRatesUpdated')}: {new Date(currencyRatesUpdatedAt).toLocaleDateString(language)}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Language Toggle */}
        <div className="flex h-9 items-center rounded-xl border border-slate-200 bg-slate-100 p-0.5 text-[11px] dark:border-slate-700 dark:bg-slate-800">
          <button
            type="button"
            onClick={() => setLanguage(language === 'en' ? 'so' : 'en')}
            aria-label={language === 'en' ? t('switchToSomali') : t('switchToEnglish')}
            className="flex h-8 min-w-9 items-center gap-1 rounded-lg px-2 py-1 font-bold text-slate-700 transition hover:bg-white dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <Globe2 className="hidden h-3.5 w-3.5 text-rose-500 sm:block" />
            {language.toUpperCase()}
          </button>
        </div>

        {/* Dark Mode Toggle */}
        <button
          type="button"
          onClick={toggleDarkMode}
          className="flex h-9 items-center justify-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-2 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 sm:px-2.5"
          title={darkMode ? t('switchToLightMode') : t('switchToDarkMode')}
          aria-label={darkMode ? t('switchToLightMode') : t('switchToDarkMode')}
        >
          {darkMode ? <Moon className="h-4 w-4 text-slate-500 dark:text-slate-300" /> : <Sun className="h-4 w-4 text-amber-500" />}
          <span className="hidden min-[1200px]:inline">{darkMode ? t('dark') : t('light')}</span>
        </button>

        {/* Offline / Online Status */}
        <div
          role="status"
          aria-live="polite"
          className={`hidden items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-semibold min-[1200px]:flex ${
            isOffline
              ? 'bg-amber-50 dark:bg-amber-950/60 border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-400'
              : 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300'
          }`}
          title={isOffline ? t('offlineMode') : t('cloudConnected')}
        >
          {isOffline ? (
            <WifiOff className="w-3.5 h-3.5 text-amber-500" />
          ) : (
            <Wifi className="w-3.5 h-3.5 text-emerald-500" />
          )}
          <span>{isOffline ? t('offline') : t('synced')}</span>
        </div>

      </div>
    </header>
  );
};
