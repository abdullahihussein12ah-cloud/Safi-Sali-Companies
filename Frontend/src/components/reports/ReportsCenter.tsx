import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  BarChart3,
  Boxes,
  Calculator,
  UserCheck,
  ShieldCheck,
  FileDown,
  Printer,
  RefreshCw,
  Search,
  Calendar,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { AppStore } from '../../services/store';
import { exportToExcel, printHtmlDocument } from '../../utils/exports';

type ReportType = 'sales' | 'purchases' | 'inventory' | 'cogs' | 'customer_balances' | 'supplier_balances';

interface Props {
  initialReport?: ReportType;
}

export const ReportsCenter: React.FC<Props> = ({ initialReport = 'sales' }) => {
  const { showToast, t } = useApp();
  const [activeReport, setActiveReport] = useState<ReportType>(initialReport);

  const [sales, setSales] = useState(AppStore.getSales());
  const [purchases, setPurchases] = useState(AppStore.getPurchases());
  const [products, setProducts] = useState(AppStore.getProducts(true));
  const [customers, setCustomers] = useState(AppStore.getCustomers());
  const [suppliers, setSuppliers] = useState(AppStore.getSuppliers());

  const [searchFilter, setSearchFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const reloadData = () => {
    setSales(AppStore.getSales());
    setPurchases(AppStore.getPurchases());
    setProducts(AppStore.getProducts(true));
    setCustomers(AppStore.getCustomers());
    setSuppliers(AppStore.getSuppliers());
  };

  useEffect(() => {
    setActiveReport(initialReport);
  }, [initialReport]);

  useEffect(() => {
    reloadData();
    return AppStore.subscribe(reloadData);
  }, []);

  const normalizedSearch = searchFilter.trim().toLocaleLowerCase();

  const filterByDate = (dateStr: string) => {
    if (!startDate && !endDate) return true;
    const date = dateStr.slice(0, 10);
    if (startDate && date < startDate) return false;
    if (endDate && date > endDate) return false;
    return true;
  };

  const activeSales = sales.filter((sale) =>
    sale.paymentStatus !== 'refunded' &&
    filterByDate(sale.date) &&
    (!normalizedSearch || [
      sale.invoiceNumber,
      sale.customerName,
      sale.cashierName,
      sale.paymentStatus,
    ].some((value) => value.toLocaleLowerCase().includes(normalizedSearch)))
  );
  const refundedInvoicesCount = sales.filter((sale) =>
    sale.paymentStatus === 'refunded' &&
    filterByDate(sale.date) &&
    (!normalizedSearch || [
      sale.invoiceNumber,
      sale.customerName,
      sale.cashierName,
      sale.paymentStatus,
    ].some((value) => value.toLocaleLowerCase().includes(normalizedSearch)))
  ).length;
  const filteredPurchases = purchases.filter((purchase) =>
    filterByDate(purchase.date) &&
    (!normalizedSearch || [
      purchase.purchaseNumber,
      purchase.supplierName,
      purchase.paymentStatus,
      purchase.userName,
    ].some((value) => value.toLocaleLowerCase().includes(normalizedSearch)))
  );
  const filteredProducts = products.filter((product) =>
    !normalizedSearch || [
      product.name,
      product.sku,
      product.barcode,
      product.qrCode,
      product.category,
    ].some((value) => value.toLocaleLowerCase().includes(normalizedSearch))
  );
  const filteredCustomers = customers.filter((customer) =>
    !normalizedSearch || [
      customer.customerId,
      customer.name,
      customer.phone,
      customer.email || '',
    ].some((value) => value.toLocaleLowerCase().includes(normalizedSearch))
  );
  const filteredSuppliers = suppliers.filter((supplier) =>
    !normalizedSearch || [
      supplier.supplierId,
      supplier.name,
      supplier.contactPerson,
      supplier.phone,
      supplier.email || '',
    ].some((value) => value.toLocaleLowerCase().includes(normalizedSearch))
  );

  // Sales Metrics
  const totalSalesRevenue = activeSales.reduce((sum, s) => sum + s.totalAmount, 0);
  const totalCashReceived = activeSales.reduce((sum, s) => sum + s.paidAmount, 0);
  const totalOutstandingCredit = activeSales.reduce((sum, s) => sum + s.outstandingBalance, 0);
  const totalTaxCollected = activeSales.reduce((sum, s) => sum + s.tax, 0);

  // Inventory Metrics
  const totalStockCostVal = filteredProducts.reduce((sum, p) => sum + p.stock * p.purchaseCost, 0);
  const totalStockRetailVal = filteredProducts.reduce((sum, p) => sum + p.stock * p.sellingPrice, 0);
  const potentialProfit = totalStockRetailVal - totalStockCostVal;
  const lowOrOutOfStockCount = filteredProducts.filter((p) => p.stock <= p.minStock).length;

  // COGS Metrics
  const cogsByProduct = new Map<string, {
    productId: string;
    productName: string;
    sku: string;
    qtySold: number;
    totalCogs: number;
    revenue: number;
  }>();
  activeSales.forEach((sale) => {
    sale.items.forEach((item) => {
      const current = cogsByProduct.get(item.productId) || {
        productId: item.productId,
        productName: item.productName,
        sku: item.sku,
        qtySold: 0,
        totalCogs: 0,
        revenue: 0,
      };
      current.qtySold += item.quantity;
      current.totalCogs += item.quantity * item.unitCost;
      current.revenue += item.total;
      cogsByProduct.set(item.productId, current);
    });
  });
  const cogsData = Array.from(cogsByProduct.values())
    .filter((row) => !normalizedSearch || [row.productName, row.sku].some((value) => value.toLocaleLowerCase().includes(normalizedSearch)))
    .map((row) => {
      const grossProfit = row.revenue - row.totalCogs;
      return {
        ...row,
        costPerUnit: row.qtySold ? row.totalCogs / row.qtySold : 0,
        grossProfit,
        marginPct: row.revenue > 0 ? (grossProfit / row.revenue) * 100 : 0,
      };
    });

  const totalPeriodRevenue = cogsData.reduce((sum, row) => sum + row.revenue, 0);
  const totalPeriodCOGS = cogsData.reduce((s, i) => s + i.totalCogs, 0);
  const totalGrossProfit = totalPeriodRevenue - totalPeriodCOGS;
  const grossMarginPct = totalPeriodRevenue > 0 ? (totalGrossProfit / totalPeriodRevenue) * 100 : 0;

  // Customer Balances Metrics
  const debtors = filteredCustomers.filter((c) => c.currentBalance > 0);
  const totalCustomerReceivables = debtors.reduce((sum, c) => sum + c.currentBalance, 0);

  // Supplier Balances Metrics
  const creditors = filteredSuppliers.filter((s) => s.currentBalance > 0);
  const totalSupplierPayables = creditors.reduce((sum, s) => sum + s.currentBalance, 0);

  const reportTable = (() => {
    const currency = AppStore.getSettings().currency;
    if (activeReport === 'sales') {
      return {
        filename: 'Sales_Report',
        headers: ['INVOICE #', 'DATE', 'CUSTOMER', 'CASHIER', 'GRAND TOTAL', 'PAID', 'BALANCE DUE', 'STATUS'],
        rows: activeSales.map((sale) => [
          sale.invoiceNumber, sale.date, sale.customerName, sale.cashierName,
          AppStore.formatMoney(sale.totalAmount, sale.currency),
          AppStore.formatMoney(sale.paidAmount, sale.currency),
          AppStore.formatMoney(sale.outstandingBalance, sale.currency),
          sale.paymentStatus.toUpperCase(),
        ]),
      };
    }
    if (activeReport === 'purchases') {
      return {
        filename: 'Purchases_Report',
        headers: ['PO #', 'DATE', 'SUPPLIER', 'TOTAL COST', 'AMOUNT PAID', 'BALANCE DUE', 'STATUS'],
        rows: filteredPurchases.map((purchase) => [
          purchase.purchaseNumber, purchase.date, purchase.supplierName,
          AppStore.formatMoney(purchase.totalCost, currency),
          AppStore.formatMoney(purchase.paidAmount, currency),
          AppStore.formatMoney(purchase.outstandingBalance, currency),
          purchase.paymentStatus.toUpperCase(),
        ]),
      };
    }
    if (activeReport === 'inventory') {
      return {
        filename: 'Inventory_Report',
        headers: ['PRODUCT NAME', 'SKU / QR', 'CATEGORY', 'STOCK', 'COST', 'PRICE', 'STOCK VALUATION'],
        rows: filteredProducts.map((product) => [
          product.name, `${product.sku}${product.qrCode ? ` / ${product.qrCode}` : ''}`, product.category,
          `${product.stock} ${product.unit}`,
          AppStore.formatMoney(product.purchaseCost, currency),
          AppStore.formatMoney(product.sellingPrice, currency),
          AppStore.formatMoney(product.stock * product.purchaseCost, currency),
        ]),
      };
    }
    if (activeReport === 'cogs') {
      return {
        filename: 'COGS_Profit_Report',
        headers: ['PRODUCT NAME', 'SKU', 'UNITS SOLD', 'UNIT COST', 'COGS TOTAL', 'REVENUE', 'GROSS PROFIT', 'MARGIN %'],
        rows: cogsData.map((row) => [
          row.productName, row.sku, String(row.qtySold),
          AppStore.formatMoney(row.costPerUnit, currency),
          AppStore.formatMoney(row.totalCogs, currency),
          AppStore.formatMoney(row.revenue, currency),
          AppStore.formatMoney(row.grossProfit, currency),
          `${row.marginPct.toFixed(1)}%`,
        ]),
      };
    }
    if (activeReport === 'customer_balances') {
      return {
        filename: 'Customer_Balances_Report',
        headers: ['CUSTOMER ID', 'CUSTOMER NAME', 'PHONE', 'OPENING BAL', 'TOTAL CREDIT', 'TOTAL PAID', 'OUTSTANDING DEBT'],
        rows: filteredCustomers.map((customer) => [
          customer.customerId, customer.name, customer.phone,
          AppStore.formatMoney(customer.openingBalance, currency),
          AppStore.formatMoney(customer.totalCredit, currency),
          AppStore.formatMoney(customer.totalPayments, currency),
          AppStore.formatMoney(customer.currentBalance, currency),
        ]),
      };
    }
    return {
      filename: 'Supplier_Balances_Report',
      headers: ['SUPPLIER ID', 'SUPPLIER NAME', 'CONTACT', 'PHONE', 'TOTAL PURCHASES', 'TOTAL PAID', 'WE OWE'],
      rows: filteredSuppliers.map((supplier) => [
        supplier.supplierId, supplier.name, supplier.contactPerson, supplier.phone,
        AppStore.formatMoney(supplier.totalPurchases, currency),
        AppStore.formatMoney(supplier.totalPayments, currency),
        AppStore.formatMoney(supplier.currentBalance, currency),
      ]),
    };
  })();

  const handleExportExcel = () => {
    exportToExcel(reportTable.filename, reportTable.headers, reportTable.rows);
    showToast(`${reportTable.filename} exported to Excel (.xls)`, 'success');
  };

  const handleExportPDF = () => {
    const escapeHtml = (value: string): string =>
      value.replace(/[&<>"']/g, (character) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[character] || character);
    const tableHead = reportTable.headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('');
    const tableRows = reportTable.rows.map((row) =>
      `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`
    ).join('');
    printHtmlDocument(`Vertex_Tech_Technology_${activeReport}_Report`, `
      <style>
        body { font-family: Arial, sans-serif; color: #0f172a; }
        h2 { margin: 0 0 8px; }
        .meta { color: #64748b; font-size: 11px; margin-bottom: 18px; }
        table { width: 100%; border-collapse: collapse; font-size: 10px; }
        th { background: #f1f5f9; color: #64748b; text-align: left; text-transform: uppercase; }
        th, td { padding: 9px 7px; border-bottom: 1px solid #e2e8f0; }
        tr { break-inside: avoid; }
      </style>
      <h2>VERTEX TECH TECHNOLOGY - ${escapeHtml(activeReport.toUpperCase().replaceAll('_', ' '))} REPORT</h2>
      <div class="meta">Generated on ${escapeHtml(new Date().toLocaleString())} · ${reportTable.rows.length} records</div>
      <table><thead><tr>${tableHead}</tr></thead>
      <tbody>${tableRows || `<tr><td colspan="${reportTable.headers.length}">No data records found for the selected filters.</td></tr>`}</tbody></table>
    `);
  };

  return (
    <div className="space-y-6">
      {/* Top Header matching exact screenshots */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            Financial & Operational Reports Center
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Audit-ready reports with weighted average COGS, gross margins, ledgers, and exports
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              reloadData();
              showToast('Data refreshed', 'info');
            }}
            className="px-3 py-2 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-200 shadow-xs flex items-center gap-1.5 transition cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>
          <button
            onClick={handleExportExcel}
            className="px-3 py-2 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-200 shadow-xs flex items-center gap-1.5 transition cursor-pointer"
          >
            <FileDown className="w-3.5 h-3.5 text-emerald-600" />
            <span>Excel (.xlsx)</span>
          </button>
          <button
            onClick={handleExportPDF}
            className="px-3 py-2 rounded-xl text-xs font-bold border border-rose-200 dark:border-rose-900 bg-white dark:bg-slate-800 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 shadow-xs flex items-center gap-1.5 transition cursor-pointer"
          >
            <FileDown className="w-3.5 h-3.5 text-rose-600" />
            <span>Export PDF</span>
          </button>
        </div>
      </div>

      {/* Tabs Row matching screenshots */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        {[
          { id: 'sales', label: 'Sales Report', icon: BarChart3 },
          { id: 'purchases', label: 'Purchase Report', icon: TrendingUp },
          { id: 'inventory', label: 'Inventory Report', icon: Boxes },
          { id: 'cogs', label: 'COGS & Profit Report', icon: Calculator },
          { id: 'customer_balances', label: 'Customer Balances', icon: UserCheck },
          { id: 'supplier_balances', label: 'Supplier Balances', icon: ShieldCheck },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeReport === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveReport(tab.id as ReportType)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold whitespace-nowrap transition cursor-pointer border ${
                isActive
                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Filter Bar with search and date range matching screenshots */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative w-full md:w-96">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder={`Filter ${activeReport.replace('_', ' ')} records...`}
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-2xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-hidden font-medium"
          />
        </div>

        {/* Date Range Picker */}
        {(['sales', 'purchases', 'cogs'] as ReportType[]).includes(activeReport) && (
        <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 dark:bg-slate-800 p-1.5 px-3 rounded-2xl border border-slate-200 dark:border-slate-700 self-end md:self-auto font-mono">
          <Calendar className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="bg-transparent border-0 focus:outline-hidden text-xs text-slate-800 dark:text-slate-200"
          />
          <span>to</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="bg-transparent border-0 focus:outline-hidden text-xs text-slate-800 dark:text-slate-200"
          />
        </div>
        )}
      </div>

      {/* TAB-SPECIFIC CARDS & CONTENT */}

      {/* 1. SALES REPORT */}
      {activeReport === 'sales' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-4 shadow-xs">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">TOTAL SALES</span>
              <div className="text-xl font-black text-emerald-600 font-mono mt-1">
                {AppStore.formatMoney(totalSalesRevenue)}
              </div>
            </div>
            <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-4 shadow-xs">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">CASH RECEIVED</span>
              <div className="text-xl font-black text-emerald-600 font-mono mt-1">
                {AppStore.formatMoney(totalCashReceived)}
              </div>
            </div>
            <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-4 shadow-xs">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">OUTSTANDING CREDIT</span>
              <div className="text-xl font-black text-amber-500 font-mono mt-1">
                {AppStore.formatMoney(totalOutstandingCredit)}
              </div>
            </div>
            <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-4 shadow-xs">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">TAX COLLECTED</span>
              <div className="text-xl font-black text-emerald-600 font-mono mt-1">
                {AppStore.formatMoney(totalTaxCollected)}
              </div>
            </div>
            <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-4 shadow-xs col-span-2 sm:col-span-1">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">REFUNDED INVOICES</span>
              <div className="text-xl font-black text-rose-600 font-mono mt-1">
                {refundedInvoicesCount}
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/60 dark:bg-slate-800/40 text-slate-400 border-b border-slate-100 dark:border-slate-800 uppercase font-bold text-[10px] tracking-wider">
                  <tr>
                    <th className="py-3.5 px-4">INVOICE #</th>
                    <th className="py-3.5 px-4">DATE</th>
                    <th className="py-3.5 px-4">CUSTOMER</th>
                    <th className="py-3.5 px-4">CASHIER</th>
                    <th className="py-3.5 px-4">GRAND TOTAL</th>
                    <th className="py-3.5 px-4">PAID</th>
                    <th className="py-3.5 px-4">BALANCE DUE</th>
                    <th className="py-3.5 px-4 text-right">STATUS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {activeSales.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-16 text-center text-slate-400 text-xs">
                        No data records found for the selected period.
                      </td>
                    </tr>
                  ) : (
                    activeSales.map((s) => (
                      <tr key={s.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                        <td className="py-3.5 px-4 font-mono font-bold text-emerald-600">{s.invoiceNumber}</td>
                        <td className="py-3.5 px-4 text-slate-400 font-mono text-[11px]">{s.date}</td>
                        <td className="py-3.5 px-4 font-bold text-slate-900 dark:text-white">{s.customerName}</td>
                        <td className="py-3.5 px-4 text-slate-500">{s.cashierName}</td>
                        <td className="py-3.5 px-4 font-mono font-bold">{AppStore.formatMoney(s.totalAmount, s.currency)}</td>
                        <td className="py-3.5 px-4 font-mono font-semibold text-emerald-600">{AppStore.formatMoney(s.paidAmount, s.currency)}</td>
                        <td className="py-3.5 px-4 font-mono font-bold text-rose-600">
                          {s.outstandingBalance > 0 ? AppStore.formatMoney(s.outstandingBalance, s.currency) : '-'}
                        </td>
                        <td className="py-3.5 px-4 text-right uppercase text-[10px] font-bold">
                          <span className={`rounded-full border px-2.5 py-1 ${
                            s.paymentStatus === 'paid'
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                              : s.paymentStatus === 'partial'
                                ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
                                : 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300'
                          }`}>
                            {s.paymentStatus}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 2. INVENTORY REPORT */}
      {activeReport === 'inventory' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-5 shadow-xs">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">VALUATION (COST)</span>
              <div className="text-2xl font-black text-slate-900 dark:text-white font-mono mt-1">
                {AppStore.formatMoney(totalStockCostVal)}
              </div>
            </div>
            <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-5 shadow-xs">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">VALUATION (RETAIL)</span>
              <div className="text-2xl font-black text-emerald-600 font-mono mt-1">
                {AppStore.formatMoney(totalStockRetailVal)}
              </div>
            </div>
            <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-5 shadow-xs">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">POTENTIAL PROFIT</span>
              <div className="text-2xl font-black text-emerald-600 font-mono mt-1">
                +{AppStore.formatMoney(potentialProfit)}
              </div>
            </div>
            <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-5 shadow-xs">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">LOW / OUT OF STOCK</span>
              <div className="text-2xl font-black text-rose-600 font-mono mt-1">
                {lowOrOutOfStockCount} Items
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/60 dark:bg-slate-800/40 text-slate-400 border-b border-slate-100 dark:border-slate-800 uppercase font-bold text-[10px] tracking-wider">
                  <tr>
                    <th className="py-3.5 px-4">PRODUCT NAME</th>
                    <th className="py-3.5 px-4">SKU / QR</th>
                    <th className="py-3.5 px-4">CATEGORY</th>
                    <th className="py-3.5 px-4">STOCK</th>
                    <th className="py-3.5 px-4">COST</th>
                    <th className="py-3.5 px-4">PRICE</th>
                    <th className="py-3.5 px-4 text-right">STOCK VALUATION</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredProducts.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-16 text-center text-slate-400 text-xs">
                        No data records found for the selected period.
                      </td>
                    </tr>
                  ) : (
                    filteredProducts.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                        <td className="py-3.5 px-4 font-bold text-slate-900 dark:text-white">{p.name}</td>
                        <td className="py-3.5 px-4 font-mono text-slate-500">
                          {p.sku}{p.qrCode ? <span className="block text-[10px] text-slate-400">{p.qrCode}</span> : null}
                        </td>
                        <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300">{p.category}</td>
                        <td className="py-3.5 px-4 font-mono font-bold text-slate-800 dark:text-slate-200">
                          {p.stock} {p.unit}
                        </td>
                        <td className="py-3.5 px-4 font-mono text-slate-600 dark:text-slate-400">
                          {AppStore.formatMoney(p.purchaseCost, AppStore.getSettings().currency)}
                        </td>
                        <td className="py-3.5 px-4 font-mono font-bold text-slate-900 dark:text-white">
                          {AppStore.formatMoney(p.sellingPrice, AppStore.getSettings().currency)}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono font-bold text-emerald-600">
                          {AppStore.formatMoney(p.stock * p.purchaseCost, AppStore.getSettings().currency)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 3. COGS & PROFIT REPORT */}
      {activeReport === 'cogs' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-5 shadow-xs">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">TOTAL REVENUE</span>
              <div className="text-2xl font-black text-emerald-600 font-mono mt-1">
                {AppStore.formatMoney(totalPeriodRevenue)}
              </div>
            </div>
            <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-5 shadow-xs">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">COST OF GOODS SOLD (COGS)</span>
              <div className="text-2xl font-black text-rose-600 font-mono mt-1">
                {AppStore.formatMoney(totalPeriodCOGS)}
              </div>
            </div>
            <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-5 shadow-xs">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">GROSS PROFIT</span>
              <div className="text-2xl font-black text-emerald-600 font-mono mt-1">
                +{AppStore.formatMoney(totalGrossProfit)}
              </div>
            </div>
            <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-5 shadow-xs">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">GROSS MARGIN %</span>
              <div className="text-2xl font-black text-emerald-600 font-mono mt-1">
                {grossMarginPct}%
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/60 dark:bg-slate-800/40 text-slate-400 border-b border-slate-100 dark:border-slate-800 uppercase font-bold text-[10px] tracking-wider">
                  <tr>
                    <th className="py-3.5 px-4">PRODUCT NAME</th>
                    <th className="py-3.5 px-4">SKU</th>
                    <th className="py-3.5 px-4">UNITS SOLD</th>
                    <th className="py-3.5 px-4">UNIT COST</th>
                    <th className="py-3.5 px-4">COGS TOTAL</th>
                    <th className="py-3.5 px-4">REVENUE</th>
                    <th className="py-3.5 px-4 text-right">GROSS PROFIT</th>
                    <th className="py-3.5 px-4 text-right">MARGIN %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {cogsData.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-16 text-center text-slate-400 text-xs">
                        No data records found for the selected period.
                      </td>
                    </tr>
                  ) : (
                    cogsData.map((c) => (
                      <tr key={c.productId} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                        <td className="py-3.5 px-4 font-bold text-slate-900 dark:text-white">{c.productName}</td>
                        <td className="py-3.5 px-4 font-mono text-slate-400">{c.sku}</td>
                        <td className="py-3.5 px-4 font-mono font-bold">{c.qtySold}</td>
                        <td className="py-3.5 px-4 font-mono text-slate-600 dark:text-slate-400">{AppStore.formatMoney(c.costPerUnit, AppStore.getSettings().currency)}</td>
                        <td className="py-3.5 px-4 font-mono text-rose-600 font-bold">{AppStore.formatMoney(c.totalCogs, AppStore.getSettings().currency)}</td>
                        <td className="py-3.5 px-4 font-mono font-bold text-slate-900 dark:text-white">{AppStore.formatMoney(c.revenue, AppStore.getSettings().currency)}</td>
                        <td className="py-3.5 px-4 text-right font-mono font-black text-emerald-600">{AppStore.formatMoney(c.grossProfit, AppStore.getSettings().currency)}</td>
                        <td className="py-3.5 px-4 text-right font-bold text-lime-600 dark:text-lime-400">{c.marginPct.toFixed(1)}%</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 4. CUSTOMER BALANCES REPORT */}
      {activeReport === 'customer_balances' && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-4">
            <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-5 shadow-xs w-48">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">CUSTOMER ACCOUNTS</span>
              <div className="text-2xl font-black text-slate-900 dark:text-white font-mono mt-1">
                {filteredCustomers.length}
              </div>
            </div>

            <div className="bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200/60 dark:border-rose-900/40 rounded-3xl p-5 shadow-xs min-w-[240px]">
              <span className="text-[10px] uppercase font-bold text-rose-600 block">TOTAL RECEIVABLES (DEBTS)</span>
              <div className="text-2xl font-black text-rose-600 font-mono mt-1">
                {AppStore.formatMoney(totalCustomerReceivables, AppStore.getSettings().currency)}
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/60 dark:bg-slate-800/40 text-slate-400 border-b border-slate-100 dark:border-slate-800 uppercase font-bold text-[10px] tracking-wider">
                  <tr>
                    <th className="py-3.5 px-4">CUSTOMER ID</th>
                    <th className="py-3.5 px-4">CUSTOMER NAME</th>
                    <th className="py-3.5 px-4">PHONE</th>
                    <th className="py-3.5 px-4">OPENING BAL</th>
                    <th className="py-3.5 px-4">TOTAL CREDIT</th>
                    <th className="py-3.5 px-4">TOTAL PAID</th>
                    <th className="py-3.5 px-4 text-right">OUTSTANDING DEBT</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredCustomers.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-16 text-center text-slate-400 text-xs">
                        No data records found for the selected period.
                      </td>
                    </tr>
                  ) : (
                    filteredCustomers.map((c) => (
                      <tr key={c.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                        <td className="py-3.5 px-4 font-mono font-bold text-slate-500">{c.customerId}</td>
                        <td className="py-3.5 px-4 font-bold text-slate-900 dark:text-white">{c.name}</td>
                        <td className="py-3.5 px-4 font-mono text-slate-500">{c.phone}</td>
                        <td className="py-3.5 px-4 font-mono">{AppStore.formatMoney(c.openingBalance, AppStore.getSettings().currency)}</td>
                        <td className="py-3.5 px-4 font-mono text-rose-600 font-semibold">{AppStore.formatMoney(c.totalCredit, AppStore.getSettings().currency)}</td>
                        <td className="py-3.5 px-4 font-mono text-emerald-600 font-semibold">{AppStore.formatMoney(c.totalPayments, AppStore.getSettings().currency)}</td>
                        <td className="py-3.5 px-4 text-right font-mono font-black text-rose-600">{AppStore.formatMoney(c.currentBalance, AppStore.getSettings().currency)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 5. SUPPLIER BALANCES REPORT */}
      {activeReport === 'supplier_balances' && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-4">
            <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-5 shadow-xs w-48">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">SUPPLIER ACCOUNTS</span>
              <div className="text-2xl font-black text-slate-900 dark:text-white font-mono mt-1">
                {filteredSuppliers.length}
              </div>
            </div>

            <div className="bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200/60 dark:border-rose-900/40 rounded-3xl p-5 shadow-xs min-w-[240px]">
              <span className="text-[10px] uppercase font-bold text-rose-600 block">TOTAL ACCOUNTS PAYABLE</span>
              <div className="text-2xl font-black text-rose-600 font-mono mt-1">
                {AppStore.formatMoney(totalSupplierPayables, AppStore.getSettings().currency)}
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/60 dark:bg-slate-800/40 text-slate-400 border-b border-slate-100 dark:border-slate-800 uppercase font-bold text-[10px] tracking-wider">
                  <tr>
                    <th className="py-3.5 px-4">SUPPLIER ID</th>
                    <th className="py-3.5 px-4">SUPPLIER NAME</th>
                    <th className="py-3.5 px-4">CONTACT</th>
                    <th className="py-3.5 px-4">PHONE</th>
                    <th className="py-3.5 px-4">TOTAL PURCHASES</th>
                    <th className="py-3.5 px-4">TOTAL PAID</th>
                    <th className="py-3.5 px-4 text-right">WE OWE</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredSuppliers.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-16 text-center text-slate-400 text-xs">
                        No data records found for the selected period.
                      </td>
                    </tr>
                  ) : (
                    filteredSuppliers.map((s) => (
                      <tr key={s.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                        <td className="py-3.5 px-4 font-mono font-bold text-slate-500">{s.supplierId}</td>
                        <td className="py-3.5 px-4 font-bold text-slate-900 dark:text-white">{s.name}</td>
                        <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300">{s.contactPerson}</td>
                        <td className="py-3.5 px-4 font-mono text-slate-500">{s.phone}</td>
                        <td className="py-3.5 px-4 font-mono">{AppStore.formatMoney(s.totalPurchases, AppStore.getSettings().currency)}</td>
                        <td className="py-3.5 px-4 font-mono text-emerald-600 font-semibold">{AppStore.formatMoney(s.totalPayments, AppStore.getSettings().currency)}</td>
                        <td className="py-3.5 px-4 text-right font-mono font-black text-rose-600">{AppStore.formatMoney(s.currentBalance, AppStore.getSettings().currency)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 6. PURCHASE REPORT */}
      {activeReport === 'purchases' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-5 shadow-xs">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">TOTAL PURCHASES</span>
              <div className="text-2xl font-black text-slate-900 dark:text-white font-mono mt-1">
                {AppStore.formatMoney(filteredPurchases.reduce((s, p) => s + p.totalCost, 0), AppStore.getSettings().currency)}
              </div>
            </div>
            <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-5 shadow-xs">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">TOTAL PAID</span>
              <div className="text-2xl font-black text-emerald-600 font-mono mt-1">
                {AppStore.formatMoney(filteredPurchases.reduce((s, p) => s + p.paidAmount, 0), AppStore.getSettings().currency)}
              </div>
            </div>
            <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-5 shadow-xs">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">OUTSTANDING OWED</span>
              <div className="text-2xl font-black text-rose-600 font-mono mt-1">
                {AppStore.formatMoney(filteredPurchases.reduce((s, p) => s + p.outstandingBalance, 0), AppStore.getSettings().currency)}
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/60 dark:bg-slate-800/40 text-slate-400 border-b border-slate-100 dark:border-slate-800 uppercase font-bold text-[10px] tracking-wider">
                  <tr>
                    <th className="py-3.5 px-4">PO #</th>
                    <th className="py-3.5 px-4">DATE</th>
                    <th className="py-3.5 px-4">SUPPLIER</th>
                    <th className="py-3.5 px-4">TOTAL COST</th>
                    <th className="py-3.5 px-4">AMOUNT PAID</th>
                    <th className="py-3.5 px-4">BALANCE DUE</th>
                    <th className="py-3.5 px-4 text-right">STATUS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredPurchases.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-16 text-center text-slate-400 text-xs">
                        No data records found for the selected period.
                      </td>
                    </tr>
                  ) : (
                    filteredPurchases.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                        <td className="py-3.5 px-4 font-mono font-bold text-emerald-600">{p.purchaseNumber}</td>
                        <td className="py-3.5 px-4 text-slate-400 font-mono text-[11px]">{p.date}</td>
                        <td className="py-3.5 px-4 font-bold text-slate-900 dark:text-white">{p.supplierName}</td>
                        <td className="py-3.5 px-4 font-mono font-bold">{AppStore.formatMoney(p.totalCost, AppStore.getSettings().currency)}</td>
                        <td className="py-3.5 px-4 font-mono font-semibold text-emerald-600">{AppStore.formatMoney(p.paidAmount, AppStore.getSettings().currency)}</td>
                        <td className="py-3.5 px-4 font-mono font-bold text-rose-600">
                          {p.outstandingBalance > 0 ? AppStore.formatMoney(p.outstandingBalance, AppStore.getSettings().currency) : '-'}
                        </td>
                        <td className="py-3.5 px-4 text-right uppercase text-[10px] font-bold">
                          {p.paymentStatus}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
