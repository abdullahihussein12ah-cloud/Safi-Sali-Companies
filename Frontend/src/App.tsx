import React, { Component, ErrorInfo, ReactNode, useState, useEffect } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { Sidebar } from './components/layout/Sidebar';
import { Topbar } from './components/layout/Topbar';
import { MobileNavigation } from './components/layout/MobileNavigation';
import { KeyboardShortcutsModal } from './components/layout/KeyboardShortcutsModal';
import { ToastContainer } from './components/common/ToastContainer';
import { SupportChatWidget } from './components/common/SupportChatWidget';
import { SystemLockModal } from './components/lock/SystemLockModal';

// Pages
import { HomeDashboard } from './components/dashboard/HomeDashboard';
import { PointOfSale } from './components/pos/PointOfSale';
import { QRScannerPage } from './components/scanner/QRScannerPage';
import { InvoicesPage } from './components/invoices/InvoicesPage';
import { SalesRasiidPage } from './components/invoices/SalesRasiidPage';
import { CustomersPage } from './components/customers/CustomersPage';
import { CustomerDebtsPage } from './components/debts/CustomerDebtsPage';
import { SuppliersPage } from './components/suppliers/SuppliersPage';
import { SupplierDebtsPage } from './components/suppliers/SupplierDebtsPage';
import { ProductsPage } from './components/products/ProductsPage';
import { CategoriesPage } from './components/products/CategoriesPage';
import { InventoryPage } from './components/inventory/InventoryPage';
import { PurchasesPage } from './components/purchases/PurchasesPage';
import { ReportsCenter } from './components/reports/ReportsCenter';
import { UsersRolesPage } from './components/users/UsersRolesPage';
import { ChoosePlanPage } from './components/plans/ChoosePlanPage';
import { SettingsPage } from './components/settings/SettingsPage';
import { LoginPage } from './components/auth/LoginPage';
import { AccountPage } from './components/account/AccountPage';
import { SuperAdminPortal } from './components/super-admin/SuperAdminPortal';
import { PlatformDashboard } from './components/platform/PlatformDashboard';
import { RecyclingBinPage } from './components/recycling-bin/RecyclingBinPage';
import { getTabPermission, hasAnyPermission, isBusinessOwnerRole } from './services/permissions';

class AppErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Application screen failed to render:', error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6 text-slate-900 dark:bg-slate-950 dark:text-white">
          <section role="alert" className="w-full max-w-lg rounded-2xl border border-rose-200 bg-white p-6 text-center shadow-lg dark:border-rose-900 dark:bg-slate-900">
            <h1 className="text-lg font-bold">This page could not be displayed</h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Reload the page to try again. If the problem continues, contact your administrator.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-5 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-500"
            >
              Reload page
            </button>
          </section>
        </main>
      );
    }
    return this.props.children;
  }
}

const AppContent: React.FC = () => {
  const {
    activeTab,
    setActiveTab,
    activeUser,
    isAuthenticated,
    authLoading,
    permissions,
    permissionsReady,
    logout,
  } = useApp();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [shortcutsModalOpen, setShortcutsModalOpen] = useState(false);
  const [hasPasswordResetToken, setHasPasswordResetToken] = useState(
    () => new URLSearchParams(window.location.search).has('resetToken')
  );

  useEffect(() => {
    const handleNavigation = () => {
      setHasPasswordResetToken(new URLSearchParams(window.location.search).has('resetToken'));
    };
    window.addEventListener('popstate', handleNavigation);
    return () => window.removeEventListener('popstate', handleNavigation);
  }, []);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }
      if (e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        setActiveTab('pos');
      } else if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        setActiveTab('scanner');
      } else if (e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        setActiveTab('customer_debts');
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        setActiveTab('report_sales');
      } else if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        setActiveTab('products');
      } else if (e.key === '?') {
        e.preventDefault();
        setShortcutsModalOpen((prev) => !prev);
      } else if (e.key === 'Escape') {
        setShortcutsModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setActiveTab]);

  // If not authenticated, render Login view directly
  if (!isAuthenticated || hasPasswordResetToken) {
    if (authLoading && !hasPasswordResetToken) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-slate-100 text-sm font-semibold text-slate-600 dark:bg-slate-950 dark:text-slate-300">
          Loading secure workspace...
        </div>
      );
    }
    return (
      <>
        <LoginPage />
        <SupportChatWidget />
        <ToastContainer />
      </>
    );
  }

  if (['super_admin', 'business_admin', 'affiliate', 'finance_admin'].includes(activeUser.role)) {
    return <PlatformDashboard role={activeUser.role} user={activeUser} onLogout={logout} />;
  }

  if (activeUser.role === 'super_admin') {
    return (
      <>
        <SuperAdminPortal />
        <SupportChatWidget />
        <ToastContainer />
      </>
    );
  }

  const renderActiveView = () => {
    const requiredPermissions = getTabPermission(activeTab);
    if (
      (activeTab === 'users_roles' && activeUser.role !== 'business_admin' && !isBusinessOwnerRole(activeUser.role)) ||
      (requiredPermissions.length && !hasAnyPermission(permissions, requiredPermissions))
    ) {
      return (
        <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
          You do not have permission to access this module.
        </div>
      );
    }

    switch (activeTab) {
      case 'home':
        return <HomeDashboard />;
      case 'pos':
        return <PointOfSale />;
      case 'scanner':
        return <QRScannerPage />;
      case 'pos_invoices':
        return <InvoicesPage posOnly={true} />;
      case 'invoices':
        return <InvoicesPage posOnly={false} />;
      case 'customers':
        return <CustomersPage />;
      case 'customer_debts':
        return <CustomerDebtsPage />;
      case 'sales_rasiid':
        return <SalesRasiidPage />;
      case 'suppliers':
        return <SuppliersPage />;
      case 'supplier_debts':
        return <SupplierDebtsPage />;
      case 'products':
        return <ProductsPage />;
      case 'categories':
        return <CategoriesPage />;
      case 'inventory':
        return <InventoryPage />;
      case 'purchases':
        return <PurchasesPage />;
      case 'reports':
      case 'report_sales':
      case 'report_purchases':
      case 'report_inventory':
      case 'report_cogs':
      case 'report_customer_balances':
      case 'report_supplier_balances':
        return <ReportsCenter initialReport={activeTab === 'reports' ? 'sales' : (activeTab.replace('report_', '') as any)} />;
      case 'users_roles':
        return <UsersRolesPage view="roles" />;
      case 'employee':
        return <UsersRolesPage view="employees" />;
      case 'recycling_bin':
        return <RecyclingBinPage />;
      case 'account':
        return <AccountPage />;
      case 'choose_plan':
        return <ChoosePlanPage />;
      case 'settings':
        return <SettingsPage />;
      default:
        return <HomeDashboard />;
    }
  };

  return (
    <div className="min-h-dvh overflow-x-clip bg-slate-100/60 font-sans text-slate-900 antialiased dark:bg-slate-950 dark:text-slate-100 flex flex-col">
      {/* Sidebar */}
      <Sidebar
        mobileOpen={mobileSidebarOpen}
        setMobileOpen={setMobileSidebarOpen}
        collapsed={sidebarCollapsed}
        setCollapsed={setSidebarCollapsed}
      />

      {/* Main Content Area */}
      <div
        className={`min-w-0 flex-1 flex flex-col transition-all duration-200 ${
          sidebarCollapsed ? 'lg:pl-20' : 'lg:pl-68'
        }`}
      >
        <Topbar
          onToggleSidebar={() => setMobileSidebarOpen(true)}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
          collapsed={sidebarCollapsed}
        />
        <main className="min-w-0 w-full max-w-7xl flex-1 mx-auto p-3 pb-[calc(6rem+env(safe-area-inset-bottom))] select-text touch-pan-y sm:p-5 sm:pb-8 lg:p-6">
          {!permissionsReady ? (
            <div className="flex min-h-48 items-center justify-center text-sm font-semibold text-slate-500">
              Loading access permissions...
            </div>
          ) : renderActiveView()}
        </main>
      </div>

      <MobileNavigation onOpenMenu={() => setMobileSidebarOpen(true)} />

      {/* Overlays */}
      <SystemLockModal />
      <KeyboardShortcutsModal
        isOpen={shortcutsModalOpen}
        onClose={() => setShortcutsModalOpen(false)}
      />
      <SupportChatWidget />
      <ToastContainer />
    </div>
  );
};

export default function App() {
  return (
    <AppProvider>
      <AppErrorBoundary>
        <AppContent />
      </AppErrorBoundary>
    </AppProvider>
  );
}
