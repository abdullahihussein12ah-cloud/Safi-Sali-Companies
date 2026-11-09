import React, { useState, useEffect } from 'react';
import {
  Receipt,
  Search,
  FileDown,
  Printer,
  X,
  Plus,
  Trash2,
  DollarSign,
  User,
  CheckCircle2,
  AlertCircle,
  FileText,
  ChevronDown,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { AppStore } from '../../services/store';
import { SaleInvoice, Customer, Product, PaymentMethod, SaleItem } from '../../types';
import { exportInvoicePDF, exportToExcel } from '../../utils/exports';

interface Props {
  posOnly?: boolean;
}

export const InvoicesPage: React.FC<Props> = ({ posOnly = false }) => {
  const { showToast, activeUser, t } = useApp();
  const [invoices, setInvoices] = useState<SaleInvoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'partial' | 'unpaid'>('all');
  const [selectedInvoice, setSelectedInvoice] = useState<SaleInvoice | null>(null);

  // "Create Sales Invoice" Modal State (matching screenshot 11)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('walk-in');

  // Item selector fields
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [itemQuantity, setItemQuantity] = useState<number>(1);
  const [itemPrice, setItemPrice] = useState<number>(0);

  // Added items
  const [invoiceItems, setInvoiceItems] = useState<
    Array<{
      product: Product;
      quantity: number;
      unitPrice: number;
      total: number;
    }>
  >([]);

  // Payment details
  const [amountReceivedNow, setAmountReceivedNow] = useState<string>('0.00');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [isSubmittingSale, setIsSubmittingSale] = useState(false);

  const reloadData = () => {
    setInvoices(AppStore.getSales());
    setCustomers(AppStore.getCustomers());
    setProducts(AppStore.getProducts());
  };

  useEffect(() => {
    reloadData();
    return AppStore.subscribe(reloadData);
  }, []);

  // Update item price default when product is selected
  useEffect(() => {
    if (selectedProductId) {
      const p = products.find((prod) => prod.id === selectedProductId);
      if (p) {
        setItemPrice(p.sellingPrice);
      }
    }
  }, [selectedProductId, products]);

  const handleAddItem = () => {
    if (!selectedProductId) {
      showToast(t('invoiceCreateErrorSelectProduct'), 'error');
      return;
    }
    const prod = products.find((p) => p.id === selectedProductId);
    if (!prod) return;

    if (itemQuantity <= 0) {
      showToast(t('invoiceQuantityMinimum'), 'error');
      return;
    }

    const existingIdx = invoiceItems.findIndex((it) => it.product.id === prod.id);
    if (existingIdx !== -1) {
      const updated = [...invoiceItems];
      const newQty = updated[existingIdx].quantity + itemQuantity;
      updated[existingIdx] = {
        ...updated[existingIdx],
        quantity: newQty,
        unitPrice: itemPrice,
        total: newQty * itemPrice,
      };
      setInvoiceItems(updated);
    } else {
      setInvoiceItems([
        ...invoiceItems,
        {
          product: prod,
          quantity: itemQuantity,
          unitPrice: itemPrice,
          total: itemQuantity * itemPrice,
        },
      ]);
    }

    // Reset fields
    setSelectedProductId('');
    setItemQuantity(1);
    setItemPrice(0);
  };

  const handleRemoveItem = (index: number) => {
    setInvoiceItems(invoiceItems.filter((_, i) => i !== index));
  };

  const invoiceTotalAmount = invoiceItems.reduce((sum, item) => sum + item.total, 0);
  const parsedReceived = parseFloat(amountReceivedNow) || 0;
  const remainingDebt = Math.max(0, invoiceTotalAmount - parsedReceived);

  const openCreateModal = () => {
    setIsCreateModalOpen(true);
    setSelectedCustomerId('walk-in');
    setSelectedProductId('');
    setItemQuantity(1);
    setItemPrice(0);
    setInvoiceItems([]);
    setAmountReceivedNow('0.00');
    setPaymentMethod('cash');
  };

  const handleCreateInvoiceAndRecordSale = (e: React.FormEvent) => {
    e.preventDefault();
    if (invoiceItems.length === 0) {
      showToast(t('invoiceNeedsProduct'), 'error');
      return;
    }

    let customerName = 'Walk-in Cash Customer';
    let customerPhone = 'N/A';
    if (selectedCustomerId !== 'walk-in') {
      const cust = customers.find((c) => c.id === selectedCustomerId);
      if (cust) {
        customerName = cust.name;
        customerPhone = cust.phone;
      }
    } else if (remainingDebt > 0) {
      showToast(t('walkInCreditError'), 'error');
      return;
    }

    setIsSubmittingSale(true);
    try {
      const saleItems: SaleItem[] = invoiceItems.map((it) => ({
        productId: it.product.id,
        productName: it.product.name,
        sku: it.product.sku,
        unit: it.product.unit,
        quantity: it.quantity,
        unitCost: it.product.purchaseCost,
        unitPrice: it.unitPrice,
        discount: 0,
        total: it.total,
      }));

      const newInvoice = AppStore.createSale({
        customerId: selectedCustomerId !== 'walk-in' ? selectedCustomerId : undefined,
        customerName,
        customerPhone,
        cashierId: activeUser.id,
        cashierName: activeUser.name,
        items: saleItems,
        subtotal: invoiceTotalAmount,
        discount: 0,
        tax: 0,
        totalAmount: invoiceTotalAmount,
        paidAmount: Math.min(parsedReceived, invoiceTotalAmount),
        outstandingBalance: remainingDebt,
        paymentMethod: remainingDebt > 0 ? 'deyn' : paymentMethod,
        paymentStatus: remainingDebt <= 0 ? 'paid' : parsedReceived > 0 ? 'partial' : 'unpaid',
        notes: 'Generated via Sales Invoices Desk',
      });

      setIsCreateModalOpen(false);
      setSelectedInvoice(newInvoice);
      showToast(`Invoice #${newInvoice.invoiceNumber} created and recorded successfully!`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to create invoice', 'error');
    } finally {
      setIsSubmittingSale(false);
    }
  };

  const filteredInvoices = invoices.filter((inv) => {
    const matchesStatus = statusFilter === 'all' || inv.paymentStatus === statusFilter;
    const matchesSearch =
      inv.invoiceNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inv.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inv.cashierName.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const handleExportExcel = () => {
    const headers = [
      'INVOICE #',
      'DATE',
      'CUSTOMER',
      'CASHIER',
      'SUBTOTAL',
      'TOTAL AMOUNT',
      'PAID',
      'BALANCE DUE',
      'STATUS',
    ];
    const rows = filteredInvoices.map((inv) => [
      inv.invoiceNumber,
      inv.date,
      inv.customerName,
      inv.cashierName,
      `$${inv.subtotal.toFixed(2)}`,
      `$${inv.totalAmount.toFixed(2)}`,
      `$${inv.paidAmount.toFixed(2)}`,
      `$${inv.outstandingBalance.toFixed(2)}`,
      inv.paymentStatus.toUpperCase(),
    ]);
    exportToExcel('Sales_Invoices_Report', headers, rows);
    showToast(t('invoicesExported'), 'success');
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            {posOnly ? 'POS Checkout Invoices' : 'Generated Sales Invoices'}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {posOnly
              ? 'Receipts created automatically by quick POS checkout.'
              : 'Prepare a customer invoice with itemized products. Submitting records the sale, reduces stock, and updates any customer balance.'}
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {!posOnly && (
            <button
              onClick={openCreateModal}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm flex items-center gap-1.5 transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>{t('createSalesInvoice')}</span>
            </button>
          )}

          <button
            onClick={handleExportExcel}
            className="px-4 py-2 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-200 shadow-xs flex items-center gap-1.5 transition cursor-pointer"
          >
            <FileDown className="w-3.5 h-3.5 text-emerald-600" />
            <span>{t('exportExcelButton')}</span>
          </button>
        </div>
      </div>

      {/* Search and Status Pills Bar */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative w-full md:w-96">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder={t('searchInvoices')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-2xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium"
          />
        </div>

        {/* Status Pills */}
        <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800 p-1 rounded-2xl border border-slate-200 dark:border-slate-700 self-end md:self-auto text-xs font-bold">
          {(['all', 'paid', 'partial', 'unpaid'] as const).map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3.5 py-1.5 rounded-xl uppercase transition cursor-pointer ${
                statusFilter === st
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/60 dark:bg-slate-800/40 text-slate-400 border-b border-slate-100 dark:border-slate-800 uppercase font-bold text-[10px] tracking-wider">
              <tr>
                <th className="py-3.5 px-4">{t('invoiceNumberUpper')}</th>
                <th className="py-3.5 px-4">{t('date').toUpperCase()}</th>
                <th className="py-3.5 px-4">{t('customer').toUpperCase()}</th>
                <th className="py-3.5 px-4">{t('cashierUpper')}</th>
                <th className="py-3.5 px-4">{t('subtotalUpper')}</th>
                <th className="py-3.5 px-4">{t('totalAmountUpper')}</th>
                <th className="py-3.5 px-4">{t('paidUpper')}</th>
                <th className="py-3.5 px-4">{t('balanceDueUpper')}</th>
                <th className="py-3.5 px-4">{t('statusLabel')}</th>
                <th className="py-3.5 px-4 text-right">{t('actions').toUpperCase()}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-16 text-center text-slate-400 text-xs">
                    No invoices found.
                  </td>
                </tr>
              ) : (
                filteredInvoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition">
                    <td className="py-3.5 px-4 font-mono font-bold text-emerald-600">
                      {inv.invoiceNumber}
                    </td>
                    <td className="py-3.5 px-4 text-slate-400 font-mono text-[11px] whitespace-nowrap">
                      {inv.date}
                    </td>
                    <td className="py-3.5 px-4 font-bold text-slate-900 dark:text-white">
                      {inv.customerName}
                    </td>
                    <td className="py-3.5 px-4 text-slate-500">
                      {inv.cashierName}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-slate-600 dark:text-slate-400">
                      {AppStore.formatMoney(inv.subtotal)}
                    </td>
                    <td className="py-3.5 px-4 font-mono font-black text-slate-900 dark:text-white">
                      {AppStore.formatMoney(inv.totalAmount)}
                    </td>
                    <td className="py-3.5 px-4 font-mono font-semibold text-emerald-600">
                      {AppStore.formatMoney(inv.paidAmount)}
                    </td>
                    <td className="py-3.5 px-4 font-mono font-black">
                      {inv.outstandingBalance > 0 ? (
                        <span className="text-rose-600">{AppStore.formatMoney(inv.outstandingBalance)}</span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                          inv.paymentStatus === 'paid'
                            ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                            : inv.paymentStatus === 'unpaid'
                            ? 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300'
                            : 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300'
                        }`}
                      >
                        {inv.paymentStatus}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={() => setSelectedInvoice(inv)}
                        className="px-2.5 py-1 rounded-lg text-xs font-bold text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 transition cursor-pointer"
                      >
                        View Invoice
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CREATE SALES INVOICE MODAL - exact matching IMG-20261019-WA0009.jpg */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-xl shadow-2xl p-6 sm:p-7 space-y-4 max-h-[92vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
                  Create a sales invoice
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed max-w-md">
                  This submits a sale immediately: inventory is reduced and any unpaid balance is added to the customer ledger.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateInvoiceAndRecordSale} className="space-y-4 text-xs">
              {/* Customer Dropdown */}
              <div>
                <label className="block text-xs font-bold text-slate-900 dark:text-white mb-1.5">
                  Customer
                </label>
                <div className="relative">
                  <select
                    value={selectedCustomerId}
                    onChange={(e) => setSelectedCustomerId(e.target.value)}
                    className="w-full appearance-none px-4 py-2.5 rounded-xl bg-slate-50/50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-hidden focus:ring-2 focus:ring-[#76ceaa] cursor-pointer"
                  >
                    <option value="walk-in">{t('selectCustomerLabel')}</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.currentBalance > 0 ? `(Bal: $${c.currentBalance.toFixed(2)})` : ''}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 text-slate-800 dark:text-slate-300 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              {/* Product + Quantity + Add Item Row */}
              <div className="flex items-end gap-2.5">
                <div className="flex-1 min-w-0">
                  <label className="block text-xs font-bold text-slate-900 dark:text-white mb-1.5">
                    Product
                  </label>
                  <div className="relative">
                    <select
                      value={selectedProductId}
                      onChange={(e) => setSelectedProductId(e.target.value)}
                      className="w-full appearance-none px-3.5 py-2.5 rounded-xl bg-slate-50/50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-hidden focus:ring-2 focus:ring-[#76ceaa] cursor-pointer"
                    >
                      <option value="">{t('selectProductLabel')}</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} (${p.sellingPrice.toFixed(2)})
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="w-4 h-4 text-slate-800 dark:text-slate-300 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>

                <div className="w-24 shrink-0">
                  <label className="block text-xs font-bold text-slate-900 dark:text-white mb-1.5">
                    Quantity
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={itemQuantity}
                    onChange={(e) => setItemQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-50/50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-900 dark:text-white text-center focus:outline-hidden focus:ring-2 focus:ring-[#76ceaa]"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleAddItem}
                  className="h-[40px] px-4 rounded-xl font-bold text-xs text-white bg-[#76ceaa] hover:bg-[#65c09a] transition shadow-xs flex items-center justify-center gap-1 shrink-0 cursor-pointer"
                >
                  <span>+ Add Item</span>
                </button>
              </div>

              {/* Added Items Table Box */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-slate-900">
                <div className="grid grid-cols-12 bg-slate-50/60 dark:bg-slate-800/40 px-4 py-2.5 text-xs font-bold text-slate-800 dark:text-slate-200 border-b border-slate-100 dark:border-slate-800">
                  <div className="col-span-5 text-left">{t('itemLabel')}</div>
                  <div className="col-span-2 text-center">{t('qtyLabel')}</div>
                  <div className="col-span-2 text-center">{t('priceLabelShort')}</div>
                  <div className="col-span-3 text-right">{t('total')}</div>
                </div>

                {invoiceItems.length === 0 ? (
                  <div className="py-7 text-center text-slate-400 dark:text-slate-500 font-normal text-xs">
                    Add at least one product.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-48 overflow-y-auto">
                    {invoiceItems.map((item, idx) => (
                      <div key={idx} className="grid grid-cols-12 items-center px-4 py-2.5 text-xs text-slate-800 dark:text-slate-200">
                        <div className="col-span-5 font-semibold text-slate-900 dark:text-white truncate pr-2">
                          {item.product.name}
                        </div>
                        <div className="col-span-2 text-center font-mono font-bold">{item.quantity}</div>
                        <div className="col-span-2 text-center font-mono">${item.unitPrice.toFixed(2)}</div>
                        <div className="col-span-3 text-right font-mono font-bold flex items-center justify-end gap-1.5">
                          <span>${item.total.toFixed(2)}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(idx)}
                            className="text-slate-400 hover:text-rose-500 p-0.5 ml-1"
                            title={t('removeItem')}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Invoice total (left) & Amount received now (right) */}
              <div className="flex items-end justify-between pt-2">
                <div className="text-sm font-bold text-slate-900 dark:text-white pb-1">
                  Invoice total: <span className="font-mono">${invoiceTotalAmount.toFixed(2)}</span>
                </div>

                <div className="w-48 sm:w-56 text-left">
                  <label className="block text-xs font-bold text-slate-900 dark:text-white mb-1.5">
                    Amount received now
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={amountReceivedNow}
                    onChange={(e) => setAmountReceivedNow(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50/50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs font-mono font-bold text-slate-900 dark:text-white text-left focus:outline-hidden focus:ring-2 focus:ring-[#76ceaa]"
                    placeholder="0.00"
                  />
                </div>
              </div>

              {/* Bottom Buttons matching screenshot */}
              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-5 py-2.5 rounded-xl font-bold text-xs bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-900 dark:text-slate-100 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingSale || invoiceItems.length === 0}
                  className="px-5 py-2.5 rounded-xl font-bold text-xs bg-[#76ceaa] hover:bg-[#65c09a] text-white shadow-xs disabled:opacity-50 transition cursor-pointer"
                >
                  Create invoice and record sale
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Generated Invoice Modal */}
      {selectedInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-lg shadow-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Receipt className="w-5 h-5 text-emerald-600" />
                <h3 className="font-bold text-slate-900 dark:text-white text-base">
                  Invoice #{selectedInvoice.invoiceNumber}
                </h3>
              </div>
              <button onClick={() => setSelectedInvoice(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>{t('invoiceDateLabel')}</span>
                <span className="font-mono">{selectedInvoice.date}</span>
              </div>
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>{t('customerLabel')}</span>
                <span className="font-bold text-slate-900 dark:text-white">{selectedInvoice.customerName}</span>
              </div>
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>{t('cashierLabel')}</span>
                <span>{selectedInvoice.cashierName}</span>
              </div>
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>{t('statusLabelInline')}</span>
                <span className="font-bold uppercase text-emerald-600">{selectedInvoice.paymentStatus}</span>
              </div>

              <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden mt-3">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800 font-semibold text-slate-500">
                    <tr>
                      <th className="p-2">{t('itemLabel')}</th>
                      <th className="p-2 text-center">{t('qtyLabel')}</th>
                      <th className="p-2 text-right">{t('priceLabelShort')}</th>
                      <th className="p-2 text-right">{t('total')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {selectedInvoice.items.map((it, idx) => (
                      <tr key={idx}>
                        <td className="p-2 font-medium">{it.productName}</td>
                        <td className="p-2 text-center font-mono">{it.quantity}</td>
                        <td className="p-2 text-right font-mono">${it.unitPrice.toFixed(2)}</td>
                        <td className="p-2 text-right font-mono font-bold">${it.total.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="pt-2 space-y-1 text-right">
                <div className="flex justify-between font-black text-sm text-slate-900 dark:text-white">
                  <span>{t('grandTotal')}:</span>
                  <span>{AppStore.formatMoney(selectedInvoice.totalAmount)}</span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>{t('paidAmount')}:</span>
                  <span>{AppStore.formatMoney(selectedInvoice.paidAmount)}</span>
                </div>
                {selectedInvoice.outstandingBalance > 0 && (
                  <div className="flex justify-between text-rose-600 font-bold">
                    <span>{t('balanceDue')}:</span>
                    <span>{AppStore.formatMoney(selectedInvoice.outstandingBalance)}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={() => exportInvoicePDF(selectedInvoice, AppStore.getSettings())}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center justify-center gap-1.5"
              >
                <FileDown className="w-3.5 h-3.5" />
                <span>{t('exportPDF')}</span>
              </button>
              <button
                onClick={() => exportInvoicePDF(selectedInvoice, AppStore.getSettings())}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>{t('printInvoice')}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
