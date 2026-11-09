import React, { useState, useEffect } from 'react';
import {
  Crown,
  DollarSign,
  TrendingUp,
  CreditCard,
  Package,
  ArrowUpRight,
  RefreshCw,
  ShoppingCart,
  Receipt,
  FileText,
  Users,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { AppStore } from '../../services/store';
import { getBusinessTeamActivity, getStoredAccessToken } from '../../services/api';
import {
  BusinessTeamSale,
  BusinessTeamSalesSummary,
  Product,
  SaleInvoice,
  Customer,
  Supplier,
} from '../../types';

export const HomeDashboard: React.FC = () => {
  const { setActiveTab, activeUser, showToast, t } = useApp();

  const [sales, setSales] = useState<SaleInvoice[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [registeredProductsCount, setRegisteredProductsCount] = useState(
    AppStore.getProductsForManagement().length
  );
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchases, setPurchases] = useState(AppStore.getPurchases());
  const [period, setPeriod] = useState<'Day' | 'Week' | 'Month' | 'Year'>('Week');
  const [teamSales, setTeamSales] = useState<BusinessTeamSale[]>([]);
  const [teamStaffSummaries, setTeamStaffSummaries] = useState<BusinessTeamSalesSummary[]>([]);
  const [teamSalesLoading, setTeamSalesLoading] = useState(false);
  const [teamSalesPage, setTeamSalesPage] = useState(1);
  const [teamSalesPageCount, setTeamSalesPageCount] = useState(1);
  const [teamSalesTotal, setTeamSalesTotal] = useState(0);
  const isBusinessAdministrator = ['admin', 'business_owner', 'business_admin'].includes(activeUser.role);
  const welcomeMessageKey = activeUser.role === 'admin'
    ? 'welcomeAdminFullAccessOwner'
    : ['business_owner', 'business_admin'].includes(activeUser.role)
      ? 'welcomeBusinessAdmin'
      : 'welcomeBackName';

  const reloadData = () => {
    setSales(AppStore.getSales());
    setProducts(AppStore.getProducts(true));
    setRegisteredProductsCount(AppStore.getProductsForManagement().length);
    setCustomers(AppStore.getCustomers());
    setSuppliers(AppStore.getSuppliers());
    setPurchases(AppStore.getPurchases());
  };

  useEffect(() => {
    reloadData();
    return AppStore.subscribe(reloadData);
  }, []);

  useEffect(() => {
    if (!isBusinessAdministrator) return;
    let mounted = true;
    const token = getStoredAccessToken();
    if (!token) {
      showToast('Sign in again to load team sales activity.', 'error');
      return;
    }

    setTeamSalesLoading(true);
    getBusinessTeamActivity(token, teamSalesPage)
      .then((result) => {
        if (!mounted) return;
        setTeamSales(result.sales);
        setTeamStaffSummaries(result.staff);
        setTeamSalesPageCount(Math.max(1, result.pagination.pageCount));
        setTeamSalesTotal(result.pagination.total);
      })
      .catch((error: Error) => {
        if (mounted) showToast(error.message, 'error');
      })
      .finally(() => {
        if (mounted) setTeamSalesLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [activeUser.id, activeUser.role, teamSalesPage]);

  // Filter sales for today
  const todayStr = new Date().toISOString().split('T')[0];
  const todaySales = sales.filter((s) => s.date.startsWith(todayStr) && s.paymentStatus !== 'refunded');
  const todayRevenue = todaySales.reduce((acc, s) => acc + s.totalAmount, 0);

  const todayCOGS = todaySales.reduce((acc, s) => {
    return acc + s.items.reduce((itemAcc, it) => itemAcc + it.unitCost * it.quantity, 0);
  }, 0);
  const todayProfit = todayRevenue - todayCOGS;

  // Receivables & Payables
  const totalCustomerDebt = customers.reduce((sum, c) => sum + (c.currentBalance > 0 ? c.currentBalance : 0), 0);
  const totalSupplierPayables = suppliers.reduce((sum, s) => sum + (s.currentBalance > 0 ? s.currentBalance : 0), 0);
  const totalInventoryCost = products.reduce((sum, p) => sum + p.purchaseCost * p.stock, 0);

  // Cumulative metrics
  const cumulativeSales = sales
    .filter((s) => s.paymentStatus !== 'refunded')
    .reduce((sum, s) => sum + s.totalAmount, 0);
  const totalPurchasesCost = purchases.reduce((sum, p) => sum + p.totalCost, 0);
  const rasiidCollected = sales.reduce((sum, s) => sum + s.paidAmount, 0);

  // Payment Methods Breakdown (today's sales and customer payments)
  let evcPlusTotal = 0;
  let cashTotal = 0;
  let creditDeynTotal = 0;
  let zaadSahalTotal = 0;

  todaySales.forEach((s) => {
    if (s.paymentMethod === 'evc_plus' || s.paymentMethod === 'premier_wallet') {
      evcPlusTotal += s.paidAmount;
    } else if (s.paymentMethod === 'cash') {
      cashTotal += s.paidAmount;
    } else if (s.paymentMethod === 'zaad' || s.paymentMethod === 'sahal') {
      zaadSahalTotal += s.paidAmount;
    } else if (s.paymentMethod === 'deyn') {
      if (s.paidAmount > 0) {
        cashTotal += s.paidAmount;
      }
    }
    if (s.outstandingBalance > 0) {
      creditDeynTotal += s.outstandingBalance;
    }
  });

  // Include customer ledger payments
  const customerPayments = AppStore.getCustomerLedger().filter(
    (l) => l.type === 'payment' && l.date.startsWith(todayStr)
  );
  customerPayments.forEach((p) => {
    if (p.paymentMethod === 'evc_plus' || p.paymentMethod === 'premier_wallet') {
      evcPlusTotal += p.amount;
    } else if (p.paymentMethod === 'cash') {
      cashTotal += p.amount;
    } else if (p.paymentMethod === 'zaad' || p.paymentMethod === 'sahal') {
      zaadSahalTotal += p.amount;
    }
  });

  const paymentBreakdown = [
    { label: 'EVC Plus', amount: evcPlusTotal, color: '#10b981' },
    { label: 'Cash (Caddaan)', amount: cashTotal, color: '#2563eb' },
    { label: 'Credit (Deyn)', amount: creditDeynTotal, color: '#f43f5e' },
    { label: 'Zaad / Sahal', amount: zaadSahalTotal, color: '#f59e0b' },
  ];
  const paymentTotal = paymentBreakdown.reduce((sum, method) => sum + method.amount, 0);

  // Top Moving SKUs
  const skuStats: Record<string, { name: string; qty: number; revenue: number }> = {};
  sales.forEach((s) => {
    if (s.paymentStatus === 'refunded') return;
    s.items.forEach((it) => {
      if (!skuStats[it.productId]) {
        skuStats[it.productId] = { name: it.productName, qty: 0, revenue: 0 };
      }
      skuStats[it.productId].qty += it.quantity;
      skuStats[it.productId].revenue += it.total;
    });
  });
  const topSkus = Object.values(skuStats).sort((a, b) => b.qty - a.qty).slice(0, 5);

  // Recent Invoices & Payments
  const recentInvoices = sales.slice(0, 5);
  const customerLedgers = AppStore.getCustomerLedger().filter((l) => l.type === 'payment').slice(0, 5);

  // Days for Chart
  const chartDays = [
    { day: 'Tue, Oct 13', val: 0 },
    { day: 'Wed, Oct 14', val: 0 },
    { day: 'Thu, Oct 15', val: 0 },
    { day: 'Fri, Oct 16', val: 0 },
    { day: 'Sat, Oct 17', val: 0 },
    { day: 'Sun, Oct 18', val: 0 },
    { day: 'Mon, Oct 19', val: cumulativeSales },
  ];
  const paymentCircumference = 2 * Math.PI * 44;
  const nonZeroPaymentBreakdown = paymentBreakdown.filter((method) => method.amount > 0);
  const paymentSegments = paymentTotal > 0
    ? nonZeroPaymentBreakdown.map((method, index) => {
        const offset = nonZeroPaymentBreakdown
          .slice(0, index)
          .reduce((sum, previous) => sum + (previous.amount / paymentTotal) * paymentCircumference, 0);
        const length = (method.amount / paymentTotal) * paymentCircumference;

        return (
          <circle
            key={method.label}
            cx="60"
            cy="60"
            r="44"
            fill="none"
            stroke={method.color}
            strokeWidth="14"
            strokeDasharray={`${length} ${paymentCircumference - length}`}
            strokeDashoffset={-offset}
          />
        );
      })
    : [];

  return (
    <div className="space-y-6">
      {/* 1. Header Banner */}
      <div className="flex flex-col justify-between gap-5 rounded-3xl border border-emerald-200 bg-gradient-to-r from-emerald-50 via-white to-emerald-100/80 p-5 shadow-sm dark:border-emerald-900/70 dark:from-slate-900 dark:via-slate-900 dark:to-emerald-950/40 sm:p-7 md:flex-row md:items-center">
        <div className="min-w-0">
          <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-emerald-300/80 bg-emerald-100/80 px-3 py-1 text-[11px] font-bold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
            <Crown className="h-3.5 w-3.5 text-rose-500" />
            <span className="tracking-wider uppercase">{t('executiveCommandCenter')}</span>
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
            {t(welcomeMessageKey)}
          </h1>
          <p className="mt-2 max-w-xl text-xs leading-relaxed text-slate-600 dark:text-slate-300 sm:text-sm">
            {t('dashboardOverviewDescription')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 md:max-w-[390px] md:justify-end">
          {['admin', 'manager'].includes(activeUser.role) && (
            <button
              onClick={() => setActiveTab('pos')}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-lime-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:from-emerald-500 hover:to-lime-500"
            >
              <ShoppingCart className="w-4 h-4" />
              <span>{t('launchPosTerminal')}</span>
            </button>
          )}

          {['admin', 'manager', 'accountant'].includes(activeUser.role) && (
            <button
              onClick={() => setActiveTab('report_cogs')}
              className="rounded-xl border border-slate-200 bg-white/90 px-3.5 py-2.5 text-xs font-bold text-slate-700 shadow-xs transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <span>COGS &amp; Profit Report</span>
            </button>
          )}

          {activeUser.role === 'admin' && (
            <button
              onClick={() => setActiveTab('users_roles')}
              className="rounded-xl border border-slate-200 bg-white/90 px-3.5 py-2.5 text-xs font-bold text-slate-700 shadow-xs transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <span>{t('viewUsersRoles')}</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. Telemetry Controls Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              {t('liveEnterpriseTelemetry')}
            </h2>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            {t('liveMetricsDescription')}
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <div className="flex items-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-1 gap-1 text-xs">
            <span className="text-[11px] text-slate-400 font-medium px-2">{t('chartPeriod')}</span>
            {(['Day', 'Week', 'Month', 'Year'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1 rounded-lg font-bold text-xs transition cursor-pointer ${
                  period === p
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {t(p.toLowerCase())}
              </button>
            ))}
          </div>

          <button
            onClick={() => {
              reloadData();
              showToast(t('metricsRefreshed'), 'info');
            }}
            className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white transition cursor-pointer"
            title={t('refreshMetrics')}
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 3. Four Primary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Today's Revenue */}
        <div className="bg-white dark:bg-slate-900 border-t-4 border-t-emerald-500 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
              {t('todaysRevenue')}
            </span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white font-mono mt-2">
            {AppStore.formatMoney(todayRevenue)}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            {todaySales.length} {t('transactionsToday')}
          </div>
        </div>

        {/* Card 2: Today's Profit */}
        <div className="bg-white dark:bg-slate-900 border-t-4 border-t-emerald-600 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
              {t('todaysProfit')}
            </span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white font-mono mt-2">
            {AppStore.formatMoney(todayProfit)}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            {t('calculatedTodaysInvoices')}
          </div>
        </div>

        {/* Card 3: Customer Debts */}
        <div
          onClick={() => setActiveTab('customer_debts')}
          className="bg-white dark:bg-slate-900 border-t-4 border-t-rose-500 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 shadow-xs cursor-pointer hover:border-rose-300 transition group"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
              {t('customerDebts')}
            </span>
            <div className="w-8 h-8 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-500 flex items-center justify-center">
              <CreditCard className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-rose-600 font-mono mt-2">
            {AppStore.formatMoney(totalCustomerDebt)}
          </div>
          <div className="flex items-center justify-between text-[11px] text-rose-600 mt-1">
            <span>{customers.filter((c) => c.currentBalance > 0).length} {t('activeDebtAccounts')}</span>
            <ArrowUpRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition" />
          </div>
        </div>

        {/* Card 4: Inventory Value */}
        <div
          onClick={() => setActiveTab('inventory')}
          className="bg-white dark:bg-slate-900 border-t-4 border-t-teal-500 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 shadow-xs cursor-pointer hover:border-teal-300 transition group"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
              {t('inventoryValue')}
            </span>
            <div className="w-8 h-8 rounded-xl bg-teal-50 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400 flex items-center justify-center">
              <Package className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white font-mono mt-2">
            {AppStore.formatMoney(totalInventoryCost)}
          </div>
          <div className="flex items-center justify-between text-[11px] text-teal-600 mt-1">
            <span>{registeredProductsCount} {t('productsRegisteredCount')}</span>
            <ArrowUpRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition" />
          </div>
        </div>
      </div>

      {/* 4. Secondary Metric Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-3.5 shadow-xs">
          <span className="text-[10px] uppercase font-bold text-slate-400 block">{t('cumulativeSales')}</span>
          <div className="text-base font-black text-slate-900 dark:text-white font-mono mt-1">
            {AppStore.formatMoney(cumulativeSales)}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-3.5 shadow-xs">
          <span className="text-[10px] uppercase font-bold text-slate-400 block">{t('totalPurchases')}</span>
          <div className="text-base font-black text-slate-900 dark:text-white font-mono mt-1">
            {AppStore.formatMoney(totalPurchasesCost)}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-3.5 shadow-xs">
          <span className="text-[10px] uppercase font-bold text-rose-500 block">{t('supplierPayables')}</span>
          <div className="text-base font-black text-rose-600 font-mono mt-1">
            {AppStore.formatMoney(totalSupplierPayables)}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-3.5 shadow-xs">
          <span className="text-[10px] uppercase font-bold text-emerald-600 block">{t('rasiidCollected')}</span>
          <div className="text-base font-black text-emerald-600 font-mono mt-1">
            {AppStore.formatMoney(rasiidCollected)}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-3.5 shadow-xs">
          <span className="text-[10px] uppercase font-bold text-slate-400 block">{t('registeredClients')}</span>
          <div className="text-base font-black text-slate-900 dark:text-white font-mono mt-1">
            {customers.length}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-3.5 shadow-xs">
          <span className="text-[10px] uppercase font-bold text-slate-400 block">{t('activeVendors')}</span>
          <div className="text-base font-black text-slate-900 dark:text-white font-mono mt-1">
            {suppliers.length}
          </div>
        </div>
      </div>

      {/* Payment Methods Breakdown */}
      {isBusinessAdministrator && (
        <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-100 p-5 dark:border-slate-800">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">{t('teamSalesActivity')}</h2>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{t('teamSalesActivityDescription')}</p>
          </div>
          {teamSalesLoading ? (
            <p className="p-5 text-sm text-slate-500">{t('loadingTeamSales')}</p>
          ) : teamSales.length === 0 ? (
            <p className="p-5 text-sm text-slate-500">{t('noTeamSales')}</p>
          ) : (
            <>
              <div className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-2 lg:grid-cols-4 dark:border-slate-800">
                {teamStaffSummaries.map((staff) => (
                  <article key={staff.id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                    <p className="truncate text-xs font-bold text-slate-900 dark:text-white">{staff.name}</p>
                    <p className="mt-1 text-[10px] text-slate-500">{t(staff.role)} · {staff.salesCount} {t('sales')}</p>
                    {staff.totals.map(({ currency, amount }) => (
                      <p key={currency} className="mt-2 text-xs font-black text-emerald-700 dark:text-emerald-300">
                        {AppStore.formatMoney(amount, currency)}
                      </p>
                    ))}
                  </article>
                ))}
              </div>
              <div className="max-h-96 overflow-auto">
                <table className="w-full min-w-[760px] text-left text-xs">
                  <thead className="sticky top-0 bg-slate-50 text-[10px] font-bold uppercase text-slate-500 dark:bg-slate-800">
                    <tr>
                      <th className="px-4 py-3">{t('date')}</th>
                      <th className="px-4 py-3">{t('receiptNumberShort')}</th>
                      <th className="px-4 py-3">{t('employee')}</th>
                      <th className="px-4 py-3">{t('itemsSold')}</th>
                      <th className="px-4 py-3">{t('status')}</th>
                      <th className="px-4 py-3 text-right">{t('total')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {teamSales.map((sale) => (
                      <tr key={`${sale.cashierId}-${sale.id}`} className="text-slate-700 dark:text-slate-300">
                        <td className="whitespace-nowrap px-4 py-3">{sale.date || '—'}</td>
                        <td className="px-4 py-3 font-mono font-bold text-emerald-700 dark:text-emerald-300">{sale.invoiceNumber || '—'}</td>
                        <td className="px-4 py-3">
                          <span className="font-semibold">{sale.cashierName}</span>
                          <span className="ml-1 text-[10px] text-slate-400">({t(sale.cashierRole)})</span>
                        </td>
                        <td className="max-w-64 px-4 py-3">{sale.items.map((item) => `${item.productName} × ${item.quantity}`).join(', ') || '—'}</td>
                        <td className="px-4 py-3 uppercase">{sale.paymentStatus}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right font-mono font-bold">
                          {AppStore.formatMoney(sale.totalAmount, sale.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {teamSalesTotal > 50 && (
                <div className="flex items-center justify-end gap-2 border-t border-slate-100 p-3 text-[10px] dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setTeamSalesPage((page) => Math.max(1, page - 1))}
                    disabled={teamSalesPage <= 1 || teamSalesLoading}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 font-bold disabled:opacity-40 dark:border-slate-700"
                  >
                    {t('previousPage')}
                  </button>
                  <span>{teamSalesPage} / {teamSalesPageCount}</span>
                  <button
                    type="button"
                    onClick={() => setTeamSalesPage((page) => Math.min(teamSalesPageCount, page + 1))}
                    disabled={teamSalesPage >= teamSalesPageCount || teamSalesLoading}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 font-bold disabled:opacity-40 dark:border-slate-700"
                  >
                    {t('nextPage')}
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      )}

      <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900 sm:p-6">
        <div>
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">
            {t('paymentMethodsBreakdown')}
          </h2>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            {t('paymentMethodsDescription')}
          </p>
        </div>

        <div className="mt-5 grid grid-cols-[96px_minmax(0,1fr)] items-center gap-3 sm:grid-cols-[minmax(140px,1fr)_minmax(0,2fr)] sm:gap-8">
          <div className="flex justify-center">
            <div className="relative h-24 w-24 sm:h-36 sm:w-36" role="img" aria-label={`Today's payment methods total: ${AppStore.formatMoney(paymentTotal)}`}>
              <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90" aria-hidden="true">
                <circle
                  cx="60"
                  cy="60"
                  r="44"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="14"
                  className="text-slate-100 dark:text-slate-800"
                />
                {paymentSegments}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{t('today')}</span>
                <span className="mt-1 max-w-[90px] truncate text-xs font-black text-slate-800 dark:text-slate-100">
                  {AppStore.formatMoney(paymentTotal)}
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-1">
            {paymentBreakdown.map((method) => (
              <div
                key={method.label}
                className="flex min-h-9 items-center justify-between gap-3 border-b border-slate-100 py-1.5 text-xs last:border-0 dark:border-slate-800"
              >
                <span className="flex min-w-0 items-center gap-2 text-slate-700 dark:text-slate-200">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: method.color }} />
                  <span className="truncate">{method.label}</span>
                </span>
                <span className="shrink-0 font-mono font-semibold text-slate-600 dark:text-slate-300">
                  {AppStore.formatMoney(method.amount)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 5. Chart & Top Moving SKUs Split */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left (2/3): Revenue & Gross Profit Velocity SVG Chart */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                {t('revenueGrossProfitVelocity')}
              </h3>
              <p className="text-[11px] text-slate-400">
                {t('realTimeAccountingTelemetry')}
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1.5 font-semibold text-emerald-600 dark:text-emerald-400">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
                {t('salesRevenue')}
              </span>
              <span className="flex items-center gap-1.5 font-semibold text-teal-600 dark:text-teal-400">
                <span className="w-2.5 h-2.5 rounded-full bg-teal-400 inline-block" />
                {t('netProfit')}
              </span>
            </div>
          </div>

          {/* SVG Area Chart */}
          <div className="h-64 w-full relative pt-4">
            <svg viewBox="0 0 700 240" className="w-full h-full overflow-visible">
              <defs>
                <linearGradient id="areaSalesGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#00A859" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="#00A859" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Horizontal Grid lines */}
              {[0, 1, 2, 3, 4].map((step, i) => {
                const y = 200 - i * 45;
                return (
                  <g key={step}>
                    <line x1="45" y1={y} x2="680" y2={y} stroke="#e2e8f0" strokeDasharray="3 3" />
                    <text x="35" y={y + 4} textAnchor="end" fontSize="10" fill="#94a3b8" fontFamily="monospace">
                      ${step}
                    </text>
                  </g>
                );
              })}

              {/* Chart line points */}
              {/* If no sales, flat line at 0 */}
              <line x1="50" y1="200" x2="670" y2="200" stroke="#00A859" strokeWidth="2.5" />

              {/* Days labels */}
              {chartDays.map((d, idx) => {
                const x = 50 + idx * 100;
                return (
                  <text key={d.day} x={x} y="225" textAnchor="middle" fontSize="10" fill="#64748b" fontFamily="system-ui">
                    {d.day}
                  </text>
                );
              })}
            </svg>
          </div>
        </div>

        {/* Right (1/3): Top Moving SKUs */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                {t('topMovingSkus')}
              </h3>
              <span className="text-[11px] font-semibold text-slate-400">{t('byVolume')}</span>
            </div>

            <div className="py-8">
              {topSkus.length === 0 ? (
                <div className="text-center py-12 text-xs text-slate-400">
                  {t('noSalesRecordedYet')}
                </div>
              ) : (
                <div className="space-y-3">
                  {topSkus.map((sku, idx) => (
                    <div key={idx} className="flex items-center justify-between text-xs">
                      <div className="font-semibold text-slate-800 dark:text-slate-200 truncate pr-2">
                        {sku.name}
                      </div>
                      <div className="text-right font-mono font-bold text-emerald-600 shrink-0">
                        {sku.qty} {t('itemsSold')}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <button
            onClick={() => setActiveTab('pos')}
            className="w-full py-2.5 rounded-xl text-xs font-bold bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-200 transition cursor-pointer"
          >
            {t('startNewPos')}
          </button>
        </div>
      </div>

      {/* 6. Bottom Split: Recent POS Invoices & Recent Payments (Rasiid) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Invoices */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Receipt className="w-4 h-4 text-emerald-500" />
              <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                {t('recentPosInvoices')}
              </h3>
            </div>
            <button
              onClick={() => setActiveTab('invoices')}
              className="text-xs font-bold text-emerald-600 hover:underline cursor-pointer"
            >
              {t('viewAll')}
            </button>
          </div>

          <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-400 uppercase font-semibold text-[10px]">
                <tr>
                  <th className="py-2.5 px-3">{t('invoiceNumber')}</th>
                  <th className="py-2.5 px-3">Customer</th>
                  <th className="py-2.5 px-3">{t('amount')}</th>
                  <th className="py-2.5 px-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {recentInvoices.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-slate-400">
                      {t('noInvoicesFound')}
                    </td>
                  </tr>
                ) : (
                  recentInvoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                      <td className="py-2.5 px-3 font-mono font-bold text-emerald-600">{inv.invoiceNumber}</td>
                      <td className="py-2.5 px-3 font-semibold text-slate-800 dark:text-slate-200">{inv.customerName}</td>
                      <td className="py-2.5 px-3 font-mono font-bold">{AppStore.formatMoney(inv.totalAmount)}</td>
                      <td className="py-2.5 px-3 text-right">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase bg-emerald-100 text-emerald-700">
                          {inv.paymentStatus}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent Payments (Rasiid) */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-emerald-500" />
              <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                {t('recentPayments')}
              </h3>
            </div>
            <button
              onClick={() => setActiveTab('customer_debts')}
              className="text-xs font-bold text-emerald-600 hover:underline cursor-pointer"
            >
              {t('viewLedger')}
            </button>
          </div>

          <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-400 uppercase font-semibold text-[10px]">
                <tr>
                  <th className="py-2.5 px-3">{t('receiptNumberShort')}</th>
                  <th className="py-2.5 px-3">Customer</th>
                  <th className="py-2.5 px-3">{t('method')}</th>
                  <th className="py-2.5 px-3 text-right">{t('paid')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {customerLedgers.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-slate-400">
                      {t('noPaymentsRecorded')}
                    </td>
                  </tr>
                ) : (
                  customerLedgers.map((l) => (
                    <tr key={l.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                      <td className="py-2.5 px-3 font-mono font-bold text-emerald-600">{l.reference || l.id}</td>
                      <td className="py-2.5 px-3 font-semibold text-slate-800 dark:text-slate-200">
                        {AppStore.getCustomerById(l.customerId)?.name || 'Customer'}
                      </td>
                      <td className="py-2.5 px-3 uppercase text-[10px] text-slate-500">{l.paymentMethod || 'Cash'}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-black text-emerald-600">
                        {AppStore.formatMoney(l.amount)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
