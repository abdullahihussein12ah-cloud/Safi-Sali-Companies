import React, { useState } from 'react';
import {
  LayoutDashboard,
  QrCode,
  ShoppingCart,
  Receipt,
  Users,
  CreditCard,
  Package,
  Layers,
  ShoppingBag,
  TrendingUp,
  BarChart3,
  Boxes,
  Calculator,
  CircleDollarSign,
  Landmark,
  UserCheck,
  ShieldCheck,
  Settings,
  ChevronRight,
  ChevronDown,
  X,
  LogOut,
  PhoneCall,
  Sparkles,
  Truck,
  Crown,
  Recycle,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Logo } from '../brand/Logo';
import { AppStore } from '../../services/store';
import { PermissionKey } from '../../types';
import { hasAnyPermission, isBusinessOwnerRole } from '../../services/permissions';

interface SidebarProps {
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  mobileOpen,
  setMobileOpen,
  collapsed,
}) => {
  const {
    activeTab,
    setActiveTab,
    t,
    activeUser,
    logout,
    permissions,
    permissionsReady,
  } = useApp();
  const [reportsOpen, setReportsOpen] = useState(true);
  const [supplyChainOpen, setSupplyChainOpen] = useState(true);
  const [coreOperationsOpen, setCoreOperationsOpen] = useState(true);
  // Live badge counts
  const customers = AppStore.getCustomers();
  const debtsCount = customers.filter((c) => c.currentBalance > 0).length;
  const products = AppStore.getProducts();
  const lowStockCount = products.filter((p) => p.stock <= p.minStock).length;

  const handleNavClick = (tabId: string) => {
    setActiveTab(tabId);
    setMobileOpen(false);
  };

  const canAccess = (requiredPermissions: PermissionKey[]) =>
    permissionsReady && hasAnyPermission(permissions, requiredPermissions);

  const navItemClass = (id: string) => `
    w-full min-h-10 flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-xs font-semibold transition-all duration-150 group cursor-pointer
    ${
      activeTab === id
        ? 'bg-gradient-to-r from-emerald-600 via-emerald-500 to-lime-500 text-white shadow-md shadow-emerald-600/20 ring-1 ring-emerald-700/30'
        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-white'
    }
  `;

  const navIconClass = (id: string, inactiveColor = '') =>
    `w-4 h-4 shrink-0 ${activeTab === id ? 'text-white' : inactiveColor}`;

  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar container */}
      <aside
        className={`
          fixed top-0 bottom-0 left-0 z-50 flex flex-col bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] transition-all duration-200 ease-in-out
          ${collapsed ? 'w-20' : 'w-68'}
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        {/* Brand Header */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-slate-100 dark:border-slate-800">
          <div className="overflow-hidden">
            <Logo size={collapsed ? 'sm' : 'md'} />
          </div>
          <button
            onClick={() => setMobileOpen(false)}
            className="lg:hidden min-h-10 min-w-10 flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-white"
            aria-label="Close Navigation"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Nav Items */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1 select-none scrollbar-thin">
          {/* Core Operations */}
          {canAccess(['pos', 'customers', 'reports', 'inventory', 'purchases', 'suppliers']) && (
            <div>
              {!collapsed && (
                <button
                  type="button"
                  onClick={() => setCoreOperationsOpen(!coreOperationsOpen)}
                  aria-expanded={coreOperationsOpen}
                  className="w-full px-3 pb-1 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 cursor-pointer"
                >
                  <span>{t('navCoreOperations')}</span>
                  {coreOperationsOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                </button>
              )}

              {(coreOperationsOpen || collapsed) && (
                <div className="space-y-0.5">
                  {canAccess(['reports', 'financial_reports']) && (
                    <button
                      type="button"
                      onClick={() => handleNavClick('home')}
                      className={navItemClass('home')}
                      title={collapsed ? t('navHome') : undefined}
                      aria-current={activeTab === 'home' ? 'page' : undefined}
                    >
                      <LayoutDashboard className="w-4 h-4 shrink-0" />
                      {!collapsed && <span>{t('navHome')}</span>}
                    </button>
                  )}

                  {canAccess(['pos']) && (
                    <button
                      type="button"
                      onClick={() => handleNavClick('pos')}
                      className={`w-full ${navItemClass('pos')} ${
                        activeTab === 'pos'
                          ? ''
                          : 'bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50'
                      }`}
                      title={collapsed ? t('navPOS') : undefined}
                    >
                      <ShoppingCart className={navIconClass('pos', 'text-emerald-600 dark:text-emerald-400')} />
                      {!collapsed && (
                        <div className="flex items-center justify-between w-full">
                          <span>{t('navPOS')}</span>
                          <span className="text-[9px] bg-rose-500 px-1.5 py-0.5 rounded-full font-black uppercase tracking-wide text-white">LIVE POS</span>
                        </div>
                      )}
                    </button>
                  )}

                  {canAccess(['pos']) && (
                    <button
                      type="button"
                      onClick={() => handleNavClick('scanner')}
                      className={navItemClass('scanner')}
                      title={collapsed ? t('navScanner') : undefined}
                      aria-current={activeTab === 'scanner' ? 'page' : undefined}
                    >
                      <QrCode className={navIconClass('scanner', 'text-emerald-500')} />
                      {!collapsed && <span>{t('navScanner')}</span>}
                    </button>
                  )}

                  {canAccess(['reports', 'financial_reports', 'pos']) && (
                    <button
                      type="button"
                      onClick={() => handleNavClick('invoices')}
                      className={navItemClass('invoices')}
                      title={collapsed ? t('navInvoices') : undefined}
                      aria-current={activeTab === 'invoices' ? 'page' : undefined}
                    >
                      <Receipt className={navIconClass('invoices', 'text-emerald-500')} />
                      {!collapsed && <span>{t('navInvoices')}</span>}
                    </button>
                  )}

                  {canAccess(['pos']) && (
                    <button
                      type="button"
                      onClick={() => handleNavClick('pos_invoices')}
                      className={navItemClass('pos_invoices')}
                      title={collapsed ? t('navPOSInvoices') : undefined}
                      aria-current={activeTab === 'pos_invoices' ? 'page' : undefined}
                    >
                      <Receipt className={navIconClass('pos_invoices', 'text-slate-400')} />
                      {!collapsed && <span>{t('navPOSInvoices')}</span>}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Section: Customers & Debts (Admin, Manager, Accountant) */}
          {canAccess(['customers']) && (
            <div className="pt-2">
              {!collapsed && (
                <div className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  {t('navCustomersSection')}
                </div>
              )}

              <button
                type="button"
                onClick={() => handleNavClick('customers')}
                className={navItemClass('customers')}
                title={collapsed ? t('navCustomers') : undefined}
                aria-current={activeTab === 'customers' ? 'page' : undefined}
              >
                <Users className="w-4 h-4 shrink-0" />
                {!collapsed && <span>{t('navCustomers')}</span>}
              </button>

              <button
                type="button"
                onClick={() => handleNavClick('customer_debts')}
                className={navItemClass('customer_debts')}
                title={collapsed ? t('navCustomerDebts') : undefined}
                aria-current={activeTab === 'customer_debts' ? 'page' : undefined}
              >
                <CreditCard className={navIconClass('customer_debts', 'text-rose-500')} />
                {!collapsed && (
                  <div className="flex items-center justify-between w-full">
                    <span>{t('navCustomerDebts')}</span>
                    <span
                      title={`${debtsCount} ${t('customersWithDebt')}`}
                      className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-rose-600 text-white"
                    >
                      DEYN
                    </span>
                  </div>
                )}
              </button>

              <button
                type="button"
                onClick={() => handleNavClick('sales_rasiid')}
                className={navItemClass('sales_rasiid')}
                title={collapsed ? t('navSalesRasiid') : undefined}
                aria-current={activeTab === 'sales_rasiid' ? 'page' : undefined}
              >
                <Landmark className={navIconClass('sales_rasiid', 'text-emerald-600')} />
                {!collapsed && <span>{t('navSalesRasiid')}</span>}
              </button>
            </div>
          )}

          {/* Supply chain and inventory modules */}
          {canAccess(['inventory', 'purchases', 'suppliers']) && (
            <div className="pt-2">
              {!collapsed && (
                <button
                  type="button"
                  onClick={() => setSupplyChainOpen(!supplyChainOpen)}
                  aria-expanded={supplyChainOpen}
                  className="w-full px-3 pb-1 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 cursor-pointer"
                >
                  <span>{t('navSupplyChainStock')}</span>
                  {supplyChainOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                </button>
              )}

              {(supplyChainOpen || collapsed) && (
                <div className="space-y-0.5">
                  {canAccess(['inventory']) && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleNavClick('products')}
                        className={navItemClass('products')}
                        title={collapsed ? t('navProducts') : undefined}
                        aria-current={activeTab === 'products' ? 'page' : undefined}
                      >
                        <Boxes className="w-4 h-4 shrink-0" />
                        {!collapsed && (
                          <div className="flex items-center justify-between w-full">
                            <span>{t('navProducts')}</span>
                            {lowStockCount > 0 && (
                              <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400">
                                {lowStockCount}
                              </span>
                            )}
                          </div>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleNavClick('categories')}
                        className={navItemClass('categories')}
                        title={collapsed ? t('navCategories') : undefined}
                        aria-current={activeTab === 'categories' ? 'page' : undefined}
                      >
                        <Layers className="w-4 h-4 shrink-0" />
                        {!collapsed && <span>{t('navCategories')}</span>}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleNavClick('inventory')}
                        className={navItemClass('inventory')}
                        title={collapsed ? t('navInventory') : undefined}
                        aria-current={activeTab === 'inventory' ? 'page' : undefined}
                      >
                        <Package className="w-4 h-4 shrink-0" />
                        {!collapsed && <span>{t('navInventory')}</span>}
                      </button>
                    </>
                  )}

                  {canAccess(['purchases', 'suppliers']) && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleNavClick('purchases')}
                        className={navItemClass('purchases')}
                        title={collapsed ? t('navPurchases') : undefined}
                        aria-current={activeTab === 'purchases' ? 'page' : undefined}
                      >
                        <ShoppingBag className="w-4 h-4 shrink-0" />
                        {!collapsed && <span>{t('navPurchases')}</span>}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleNavClick('suppliers')}
                        className={navItemClass('suppliers')}
                        title={collapsed ? t('navSuppliers') : undefined}
                        aria-current={activeTab === 'suppliers' ? 'page' : undefined}
                      >
                        <Truck className="w-4 h-4 shrink-0" />
                        {!collapsed && <span>{t('navSuppliers')}</span>}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleNavClick('supplier_debts')}
                        className={navItemClass('supplier_debts')}
                        title={collapsed ? t('navSupplierDebts') : undefined}
                        aria-current={activeTab === 'supplier_debts' ? 'page' : undefined}
                      >
                        <CircleDollarSign className="w-4 h-4 shrink-0" />
                        {!collapsed && <span>{t('navSupplierDebts')}</span>}
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Section: Reports & Financial Analytics (COGS & Financial Reports - Admin, Manager, Accountant) */}
          {canAccess(['reports', 'financial_reports']) && (
            <div className="pt-2">
              {!collapsed && (
                <button
                  type="button"
                  onClick={() => setReportsOpen(!reportsOpen)}
                  aria-expanded={reportsOpen}
                  className="w-full px-3 pb-1 flex items-center justify-between text-left text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 cursor-pointer"
                >
                  <span>{t('navIntelligenceAdmin')}</span>
                  {reportsOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                </button>
              )}

              {(reportsOpen || collapsed) && (
                <div className="space-y-0.5">
                  {canAccess(['reports', 'financial_reports']) && <button
                    type="button"
                    onClick={() => handleNavClick('report_sales')}
                    className={navItemClass('report_sales')}
                    title={collapsed ? t('navSalesReport') : undefined}
                    aria-current={activeTab === 'report_sales' ? 'page' : undefined}
                  >
                    <TrendingUp className={navIconClass('report_sales', 'text-emerald-500')} />
                    {!collapsed && <span>{t('navSalesReport')}</span>}
                  </button>}

                  {canAccess(['reports', 'financial_reports']) && <button
                    type="button"
                    onClick={() => handleNavClick('report_purchases')}
                    className={navItemClass('report_purchases')}
                    title={collapsed ? t('navPurchaseReport') : undefined}
                    aria-current={activeTab === 'report_purchases' ? 'page' : undefined}
                  >
                    <BarChart3 className="w-4 h-4 shrink-0" />
                    {!collapsed && <span>{t('navPurchaseReport')}</span>}
                  </button>}

                  {canAccess(['reports', 'inventory']) && <button
                    type="button"
                    onClick={() => handleNavClick('report_inventory')}
                    className={navItemClass('report_inventory')}
                    title={collapsed ? t('navInventoryReport') : undefined}
                    aria-current={activeTab === 'report_inventory' ? 'page' : undefined}
                  >
                    <Boxes className="w-4 h-4 shrink-0" />
                    {!collapsed && <span>{t('navInventoryReport')}</span>}
                  </button>}

                  {canAccess(['financial_reports']) && <button
                    type="button"
                    onClick={() => handleNavClick('report_cogs')}
                    className={navItemClass('report_cogs')}
                    title={collapsed ? t('navCOGSReport') : undefined}
                    aria-current={activeTab === 'report_cogs' ? 'page' : undefined}
                  >
                    <Calculator className={navIconClass('report_cogs', 'text-amber-500')} />
                    {!collapsed && <span>{t('navCOGSReport')}</span>}
                  </button>}

                  {canAccess(['reports', 'financial_reports', 'customers']) && <button
                    type="button"
                    onClick={() => handleNavClick('report_customer_balances')}
                    className={navItemClass('report_customer_balances')}
                    title={collapsed ? t('navCustomerBalanceReport') : undefined}
                    aria-current={activeTab === 'report_customer_balances' ? 'page' : undefined}
                  >
                    <UserCheck className="w-4 h-4 shrink-0" />
                    {!collapsed && <span>{t('navCustomerBalanceReport')}</span>}
                  </button>}

                  {canAccess(['reports', 'financial_reports', 'suppliers']) && <button
                    type="button"
                    onClick={() => handleNavClick('report_supplier_balances')}
                    className={navItemClass('report_supplier_balances')}
                    title={collapsed ? t('navSupplierBalanceReport') : undefined}
                    aria-current={activeTab === 'report_supplier_balances' ? 'page' : undefined}
                  >
                    <ShieldCheck className="w-4 h-4 shrink-0" />
                    {!collapsed && <span>{t('navSupplierBalanceReport')}</span>}
                  </button>}
                </div>
              )}
            </div>
          )}

          {canAccess(['financial_reports']) && (
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => handleNavClick('account')}
                className={navItemClass('account')}
                title={collapsed ? t('navAccount') : undefined}
                aria-current={activeTab === 'account' ? 'page' : undefined}
              >
                <CircleDollarSign className={navIconClass('account', 'text-emerald-600')} />
                {!collapsed && <span>{t('navAccount')}</span>}
              </button>
            </div>
          )}

          <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
            {canAccess(['business_settings']) && (
              <button
                type="button"
                onClick={() => handleNavClick('choose_plan')}
                className={`w-full min-h-10 flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-xs font-bold transition-all duration-150 group cursor-pointer ${
                  activeTab === 'choose_plan'
                    ? 'bg-gradient-to-r from-emerald-600 via-emerald-500 to-lime-500 text-white shadow-md shadow-emerald-600/20 ring-1 ring-emerald-400/50'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 hover:text-emerald-800 dark:hover:text-emerald-300'
                }`}
                title={collapsed ? `${t('navChoosePlan')} Pro` : undefined}
                aria-current={activeTab === 'choose_plan' ? 'page' : undefined}
              >
                <Sparkles className="w-4 h-4 shrink-0" />
                {!collapsed && (
                  <div className="flex min-w-0 w-full items-center justify-between gap-2">
                    <span className="truncate">{t('navChoosePlan')}</span>
                    <span className="rounded-full bg-rose-600 px-2 py-0.5 text-[9px] font-black uppercase leading-none tracking-wide text-white shadow-sm">
                      Pro
                    </span>
                  </div>
                )}
              </button>
            )}

            {(activeUser.role === 'business_admin' || isBusinessOwnerRole(activeUser.role)) && canAccess(['manage_users']) && (
              <button
                type="button"
                onClick={() => handleNavClick('users_roles')}
                className={navItemClass('users_roles')}
                title={collapsed ? t('navUsersRoles') : undefined}
                aria-current={activeTab === 'users_roles' ? 'page' : undefined}
              >
                <Users className="w-4 h-4 shrink-0" />
                {!collapsed && <span>{t('navUsersRoles')}</span>}
              </button>
            )}

            {canAccess(['manage_employees']) && (
              <button
                type="button"
                onClick={() => handleNavClick('employee')}
                className={navItemClass('employee')}
                title={collapsed ? t('navEmployees') : undefined}
                aria-current={activeTab === 'employee' ? 'page' : undefined}
              >
                <UserCheck className={navIconClass('employee', 'text-emerald-500')} />
                {!collapsed && <span>{t('navEmployees')}</span>}
              </button>
            )}

            {isBusinessOwnerRole(activeUser.role) && (
              <button
                type="button"
                onClick={() => handleNavClick('recycling_bin')}
                className={navItemClass('recycling_bin')}
                title={collapsed ? t('navRecyclingBin') : undefined}
                aria-current={activeTab === 'recycling_bin' ? 'page' : undefined}
              >
                <Recycle className={navIconClass('recycling_bin', 'text-amber-500')} />
                {!collapsed && <span>{t('navRecyclingBin')}</span>}
              </button>
            )}

            {canAccess(['business_settings']) && (
              <button
                type="button"
                onClick={() => handleNavClick('settings')}
                className={navItemClass('settings')}
                title={collapsed ? t('navSettings') : undefined}
                aria-current={activeTab === 'settings' ? 'page' : undefined}
              >
                <Settings className="w-4 h-4 shrink-0" />
                {!collapsed && <span>{t('navSettings')}</span>}
              </button>
            )}
          </div>

          {/* Role Mode Banner for Cashier */}
          {activeUser.role === 'cashier' && !collapsed && (
            <div className="mx-1 my-3 p-3 rounded-2xl bg-blue-50/80 dark:bg-blue-950/40 border border-blue-200/80 dark:border-blue-800 text-[11px] text-blue-800 dark:text-blue-300">
              <div className="font-bold flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                <span>{t('cashierModeActive')}</span>
              </div>
              <div className="text-[10px] text-blue-600 dark:text-blue-400 mt-0.5 leading-tight">
                {t('cashierModules')}
              </div>
            </div>
          )}

          {/* Role Mode Banner for Accountant */}
          {activeUser.role === 'accountant' && !collapsed && (
            <div className="mx-1 my-3 p-3 rounded-2xl bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-800 text-[11px] text-amber-800 dark:text-amber-300">
              <div className="font-bold flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                <span>{t('accountantModeActive')}</span>
              </div>
              <div className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5 leading-tight">
                {t('accountantModules')}
              </div>
            </div>
          )}

          {/* Role Mode Banner for Store Manager */}
          {(activeUser.role === 'manager' || activeUser.role === 'branch_manager') && !collapsed && (
            <div className="mx-1 my-3 p-3 rounded-2xl bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200/80 dark:border-emerald-800 text-[11px] text-emerald-800 dark:text-emerald-300">
              <div className="font-bold flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>{t('storeManagerMode')}</span>
              </div>
              <div className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-0.5 leading-tight">
                {t('storeManagerModules')}
              </div>
            </div>
          )}

        </div>

        {/* Account and contact details */}
        {!collapsed && (
          <div className="shrink-0 space-y-2 border-t border-slate-100 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-900/70">
            <div className="rounded-xl border border-slate-200 bg-white p-2.5 dark:border-slate-700 dark:bg-slate-800">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-white">
                  {activeUser.role === 'admin' && <Crown className="h-3 w-3" aria-hidden="true" />}
                  {activeUser.role === 'admin' ? t('admin').toUpperCase() : t(activeUser.role).toUpperCase()}
                </span>
                <span className={`flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide ${activeUser.active ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${activeUser.active ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                  {activeUser.active ? t('active') : t('inactive')}
                </span>
              </div>
              <p className="mt-1 text-[10px] leading-tight text-slate-500 dark:text-slate-400">
                {t('fullEnterpriseLedgerControl')}
              </p>
            </div>

            <div className="flex min-w-0 items-center gap-2">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-600 to-emerald-700 text-sm font-extrabold text-white">
                {activeUser.role === 'admin' ? 'A' : activeUser.name.trim().charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] font-bold text-slate-800 dark:text-slate-100">
                  {activeUser.role === 'admin' ? `Abdullahi (${t('admin')})` : activeUser.name}
                </p>
                <p className="truncate text-[9px] text-slate-500 dark:text-slate-400">
                  {activeUser.role === 'admin' ? 'abdullahihusseinabdikariim@gmail.com' : activeUser.email}
                </p>
              </div>
              <button
                type="button"
                onClick={logout}
                aria-label={t('logout')}
                title={t('logout')}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-rose-500 transition hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>

            <div className="flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2 py-1.5 dark:bg-emerald-950/40">
              <PhoneCall className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <div className="flex min-w-0 flex-1 flex-wrap items-center justify-center gap-x-2 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                <a href="https://wa.me/252613078734" target="_blank" rel="noreferrer" className="whitespace-nowrap hover:underline">
                  +252 61 3078734
                </a>
                <span aria-hidden="true">•</span>
                <a href="https://wa.me/252683723015" target="_blank" rel="noreferrer" className="whitespace-nowrap hover:underline">
                  +252 68 372 3015
                </a>
              </div>
            </div>

            <div className="text-center text-[9px] font-medium text-slate-400">{t('appVersion')}</div>
          </div>
        )}
      </aside>
    </>
  );
};
