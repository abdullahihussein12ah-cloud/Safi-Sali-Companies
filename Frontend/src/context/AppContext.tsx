import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { translations, Language } from '../locales/translations';
import { User, RoleType, ServerLicenseState, CurrencyCode, Product } from '../types';
import { AppStore } from '../services/store';
import {
  clearStoredAccessToken,
  getAuthenticatedUser,
  getMyPermissions,
  getRolePermissions,
  getStoredAccessToken,
  submitLicensePaymentRequest as createLicensePaymentRequest,
} from '../services/api';
import {
  getCachedExchangeRatesUpdatedAt,
  getCurrencyCodes,
  refreshExchangeRates,
  restoreCachedExchangeRates,
} from '../services/currencyRates';
import {
  ALL_PERMISSION_KEYS,
  isBusinessAdministratorRole,
} from '../services/permissions';

interface Toast {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

interface AppContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
  currencyCodes: CurrencyCode[];
  currencyRatesLoading: boolean;
  currencyRatesUpdatedAt: string | null;
  darkMode: boolean;
  setDarkMode: (val: boolean) => void;
  toggleDarkMode: () => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  pendingPlanId: string | null;
  setPendingPlanId: (planId: string | null) => void;
  pendingEmployeeCreation: boolean;
  setPendingEmployeeCreation: (pending: boolean) => void;
  activeUser: User;
  permissions: string[];
  permissionsLoading: boolean;
  permissionsReady: boolean;
  switchActiveRole: (role: RoleType) => void;
  isAuthenticated: boolean;
  authLoading: boolean;
  login: (user: User) => void;
  logout: () => void;
  isOffline: boolean;
  toasts: Toast[];
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  removeToast: (id: string) => void;
  posCartProductToAdd: string | null;
  setPosCartProductToAdd: (id: string | null) => void;
  license: ServerLicenseState;
  submitLicensePaymentRequest: (planId: string, trxId: string) => Promise<boolean>;
  refreshLicense: () => Promise<void>;
  clearAllMoney: () => void;
  clearAllBusinessData: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Authentication State
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);

  // Language
  const [language, setLanguageState] = useState<Language>(() => {
    return (localStorage.getItem('maqsuud_lang') as Language) || 'so';
  });

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('maqsuud_lang', lang);
  };

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const t = (key: string): string => {
    if (translations[key]) {
      return translations[key][language] || translations[key].en || key;
    }
    return key;
  };

  const [currencyCodes, setCurrencyCodes] = useState<CurrencyCode[]>(() => {
    restoreCachedExchangeRates();
    return getCurrencyCodes();
  });
  const [currencyRatesLoading, setCurrencyRatesLoading] = useState(true);
  const [currencyRatesUpdatedAt, setCurrencyRatesUpdatedAt] = useState(getCachedExchangeRatesUpdatedAt);

  // Dark Mode
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('maqsuud_dark');
    return saved !== null ? saved === 'true' : false;
  });

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      document.body.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
      document.body.classList.remove('dark');
    }
    localStorage.setItem('maqsuud_dark', String(darkMode));
  }, [darkMode]);

  const toggleDarkMode = () => setDarkMode((prev) => !prev);

  // Active Tab
  const [activeTab, setActiveTab] = useState<string>(() => {
    const user = AppStore.getActiveUser();
    if (user.role === 'cashier') return 'pos';
    if (user.role === 'accountant') return 'customer_debts';
    return 'home';
  });
  const [pendingPlanId, setPendingPlanId] = useState<string | null>(null);
  const [pendingEmployeeCreation, setPendingEmployeeCreation] = useState(false);

  // Active User
  const [activeUser, setActiveUserState] = useState<User>(() => AppStore.getActiveUser());
  const authenticatedUserRef = useRef<User | null>(null);
  const [simulatedRole, setSimulatedRole] = useState<RoleType | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [permissionsLoading, setPermissionsLoading] = useState(false);
  const [permissionsReady, setPermissionsReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    const restoreSession = async () => {
      const token = getStoredAccessToken();
      if (!token) {
        if (mounted) setAuthLoading(false);
        return;
      }
      try {
        const user = await getAuthenticatedUser(token);
        if (!['super_admin', 'business_admin', 'affiliate', 'finance_admin'].includes(user.role)) {
          await AppStore.loadWorkspace(user, token);
        }
        if (mounted) {
          authenticatedUserRef.current = user;
          setSimulatedRole(null);
          setActiveUserState(user);
          setIsAuthenticated(true);
        }
      } catch (error) {
        console.error('Unable to restore authenticated session:', error);
        clearStoredAccessToken();
        AppStore.clearWorkspaceCache();
      } finally {
        if (mounted) setAuthLoading(false);
      }
    };

    void restoreSession();
    return () => {
      mounted = false;
    };
  }, []);

  // License State
  const [license, setLicense] = useState<ServerLicenseState>(() => AppStore.getServerLicense());

  useEffect(() => {
    const handleUpdate = () => {
      setLicense(AppStore.getServerLicense());
    };
    return AppStore.subscribe(handleUpdate);
  }, []);

  useEffect(() => {
    const enforceLicenseExpiry = () => {
      const current = AppStore.getServerLicense();
      if (current.isLocked && !license.isLocked) {
        AppStore.setServerLicense(current);
      }
    };

    enforceLicenseExpiry();
    const interval = setInterval(enforceLicenseExpiry, 1000);
    return () => clearInterval(interval);
  }, [license.isLocked]);

  const submitLicensePaymentRequest = async (planId: string, trxId: string): Promise<boolean> => {
    try {
      const token = getStoredAccessToken();
      if (!token) throw new Error('Please sign in again before submitting a payment request.');
      const updatedLicense = await createLicensePaymentRequest(token, planId, trxId);
      AppStore.setServerLicense(updatedLicense);
      showToast(t('paymentAwaitingVerification'), 'info');
      return true;
    } catch (error) {
      console.error('Unable to submit the license payment request:', error);
      showToast(error instanceof Error ? error.message : 'The payment request could not be submitted.', 'error');
      return false;
    }
  };

  const refreshLicense = useCallback(async (): Promise<void> => {
    await AppStore.refreshServerLicense();
  }, []);

  const clearAllMoney = () => {
    AppStore.clearAllDashboardMoney();
    showToast('Dhammaan lacagaha, deymaha iyo rasiidhada waa la nadiifiyey ($0.00)', 'success');
  };

  const clearAllBusinessData = () => {
    AppStore.clearAllBusinessData();
    showToast('Dhammaan xogta ganacsiga si buuxda ayaa loo tirtiray ($0.00)', 'success');
  };

  const login = (user: User) => {
    authenticatedUserRef.current = user;
    AppStore.setActiveUser(user);
    setSimulatedRole(null);
    setActiveUserState(user);
    setIsAuthenticated(true);
    setAuthLoading(false);
    if (user.role === 'cashier') {
      setActiveTab('pos');
    } else if (user.role === 'accountant') {
      setActiveTab('customer_debts');
    } else {
      setActiveTab('home');
    }
  };

  const logout = () => {
    setIsAuthenticated(false);
    authenticatedUserRef.current = null;
    setSimulatedRole(null);
    clearStoredAccessToken();
    AppStore.clearWorkspaceCache();
  };

  const switchActiveRole = (role: RoleType) => {
    const authenticatedUser = authenticatedUserRef.current || AppStore.getActiveUser();
    if (authenticatedUser.role === role) {
      setSimulatedRole(null);
      setActiveUserState(authenticatedUser);
      setActiveTab(role === 'cashier' ? 'pos' : role === 'accountant' ? 'customer_debts' : 'home');
      showToast(`Returned to your signed-in ${role.toUpperCase()} account.`, 'info');
      return;
    }
    const users = AppStore.getUsers();
    const matched = users.find((u) => u.role === role) || {
      id: `usr-${role}`,
      name: `Active ${role.toUpperCase()}`,
      email: `${role}@example.com`,
      role,
      phone: '+252 61 3078734',
      active: true,
      createdAt: '2026-01-01',
    };
    setSimulatedRole(role);
    setActiveUserState(matched);
    if (role === 'cashier') {
      setActiveTab('pos');
    } else if (role === 'accountant') {
      setActiveTab('customer_debts');
    } else {
      setActiveTab('home');
    }
    showToast(`Role switched to ${role.toUpperCase()} (${matched.name.split(' ')[0]})`, 'info');
  };

  // Offline detection
  const [isOffline, setIsOffline] = useState<boolean>(!navigator.onLine);

  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      showToast('Internet connection restored. Synchronized with server.', 'success');
    };
    const handleOffline = () => {
      setIsOffline(true);
      showToast('Offline Mode: Changes saved to local storage.', 'info');
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Toasts
  const [toasts, setToasts] = useState<Toast[]>([]);
  const stockAlertQueue = useRef<Array<{ product: Product; status: 'low' | 'out' }>>([]);
  const stockAlertSnapshot = useRef<Map<string, 'ok' | 'low' | 'out'> | null>(null);
  const stockAlertTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      setPermissions([]);
      setPermissionsLoading(false);
      setPermissionsReady(false);
      return;
    }

    if (['super_admin', 'business_admin', 'affiliate', 'finance_admin'].includes(activeUser.role)) {
      setPermissions([]);
      setPermissionsLoading(false);
      setPermissionsReady(true);
      return;
    }

    const token = getStoredAccessToken();
    if (!token) {
      setPermissions([]);
      setPermissionsLoading(false);
      setPermissionsReady(true);
      showToast('Your secure session has expired. Please sign in again.', 'error');
      return;
    }

    let mounted = true;
    setPermissionsLoading(true);
    setPermissionsReady(false);
    const permissionRequest = simulatedRole
      ? getRolePermissions(token).then((result) => {
          const rolePermissions = result.roles[simulatedRole];
          if (!Array.isArray(rolePermissions)) {
            throw new Error(`The server did not return permissions for the simulated ${simulatedRole} role.`);
          }
          return rolePermissions;
        })
      : getMyPermissions(token);
    void permissionRequest
      .then((currentPermissions) => {
        if (!mounted) return;
        if (isBusinessAdministratorRole(activeUser.role) && currentPermissions.length === 0) {
          setPermissions(ALL_PERMISSION_KEYS);
          showToast('Owner permissions were restored locally; the backend continues to enforce access.', 'info');
          return;
        }
        setPermissions(currentPermissions);
      })
      .catch((error: Error) => {
        if (mounted) {
          console.error('Unable to load effective permissions:', error);
          if (isBusinessAdministratorRole(activeUser.role)) {
            setPermissions(ALL_PERMISSION_KEYS);
            showToast('Could not refresh owner permissions from the server. Showing owner modules; backend access checks remain enforced.', 'info');
          } else {
            setPermissions([]);
            showToast(error.message, 'error');
          }
        }
      })
      .finally(() => {
        if (mounted) {
          setPermissionsLoading(false);
          setPermissionsReady(true);
        }
      });

    return () => {
      mounted = false;
    };
  }, [activeUser.id, activeUser.role, isAuthenticated, showToast, simulatedRole]);

  useEffect(() => {
    if (!isAuthenticated) return;

    const getStatus = (product: Product): 'ok' | 'low' | 'out' => {
      if (product.stock <= 0) return 'out';
      return product.stock <= product.minStock ? 'low' : 'ok';
    };

    const announceNextAlert = () => {
      const next = stockAlertQueue.current.shift();
      if (!next) {
        stockAlertTimer.current = null;
        return;
      }

      const name = language === 'so' && next.product.nameSo
        ? next.product.nameSo
        : next.product.name;
      const messageTemplate = next.status === 'out'
        ? translations.stockAlertOut[language]
        : translations.stockAlertLow[language];
      const message = messageTemplate
        .replace('{name}', name)
        .replace('{quantity}', String(next.product.stock))
        .replace('{unit}', next.product.unit)
        .replace('{threshold}', String(next.product.minStock));

      showToast(message, next.status === 'out' ? 'error' : 'info');
      stockAlertTimer.current = setTimeout(announceNextAlert, 4700);
    };

    const checkStockAlerts = () => {
      const products = AppStore.getProducts();
      const currentSnapshot = new Map(products.map((product) => [product.id, getStatus(product)]));
      const previousSnapshot = stockAlertSnapshot.current;

      if (previousSnapshot === null) {
        products.forEach((product) => {
          const status = getStatus(product);
          if (status !== 'ok') {
            stockAlertQueue.current.push({ product, status });
          }
        });
      } else {
        products.forEach((product) => {
          const status = getStatus(product);
          const previousStatus = previousSnapshot.get(product.id) || 'ok';
          if (status !== 'ok' && status !== previousStatus) {
            stockAlertQueue.current.push({ product, status });
          }
        });
      }

      stockAlertSnapshot.current = currentSnapshot;
      if (stockAlertTimer.current === null && stockAlertQueue.current.length > 0) {
        announceNextAlert();
      }
    };

    checkStockAlerts();
    const unsubscribe = AppStore.subscribe(checkStockAlerts);
    return () => {
      unsubscribe();
      if (stockAlertTimer.current !== null) {
        clearTimeout(stockAlertTimer.current);
        stockAlertTimer.current = null;
      }
    };
  }, [isAuthenticated, language, showToast]);

  useEffect(() => {
    let mounted = true;

    const updateRates = async () => {
      setCurrencyRatesLoading(true);
      try {
        const updatedAt = await refreshExchangeRates();
        if (!mounted) return;
        setCurrencyCodes(getCurrencyCodes());
        setCurrencyRatesUpdatedAt(updatedAt);
      } catch (error) {
        console.error('Unable to refresh exchange rates:', error);
        if (mounted) {
          setCurrencyCodes(getCurrencyCodes());
          showToast(
            'Exchange rates could not be refreshed. Sarifyada lama cusboonaysiin karin.',
            'error'
          );
        }
      } finally {
        if (mounted) setCurrencyRatesLoading(false);
      }
    };

    const handleOnline = () => void updateRates();
    void updateRates();
    window.addEventListener('online', handleOnline);
    const intervalId = window.setInterval(() => void updateRates(), 24 * 60 * 60 * 1000);

    return () => {
      mounted = false;
      window.removeEventListener('online', handleOnline);
      window.clearInterval(intervalId);
    };
  }, [showToast]);

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const [posCartProductToAdd, setPosCartProductToAdd] = useState<string | null>(null);

  return (
    <AppContext.Provider
      value={{
        language,
        setLanguage,
        t,
        currencyCodes,
        currencyRatesLoading,
        currencyRatesUpdatedAt,
        darkMode,
        setDarkMode,
        toggleDarkMode,
        activeTab,
        setActiveTab,
        pendingPlanId,
        setPendingPlanId,
        pendingEmployeeCreation,
        setPendingEmployeeCreation,
        activeUser,
        permissions,
        permissionsLoading,
        permissionsReady,
        switchActiveRole,
        isAuthenticated,
        authLoading,
        login,
        logout,
        isOffline,
        toasts,
        showToast,
        removeToast,
        posCartProductToAdd,
        setPosCartProductToAdd,
        license,
        submitLicensePaymentRequest,
        refreshLicense,
        clearAllMoney,
        clearAllBusinessData,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
