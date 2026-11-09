import React, { useState, useEffect } from 'react';
import {
  Search,
  DollarSign,
  FileDown,
  Printer,
  X,
  CheckCircle2,
  AlertCircle,
  Receipt,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { AppStore } from '../../services/store';
import { Customer, PaymentMethod } from '../../types';
import { exportCustomerOutstandingDebtsPDF, exportToExcel } from '../../utils/exports';

export const CustomerDebtsPage: React.FC = () => {
  const { showToast, t } = useApp();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [minDebt, setMinDebt] = useState<string>('0.00');

  // Payment collection modal
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [payAmount, setPayAmount] = useState<string>('');
  const [payMethod, setPayMethod] = useState<PaymentMethod>('cash');
  const [referenceNote, setReferenceNote] = useState('');
  const [paymentReceiptNote, setPaymentReceiptNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Receipt Modal
  const [receiptData, setReceiptData] = useState<{
    receiptNumber: string;
    customer: Customer;
    amount: number;
    method: PaymentMethod;
    date: string;
    note: string;
  } | null>(null);

  const reloadData = () => {
    const list = AppStore.getCustomers();
    setCustomers(list.filter((c) => c.currentBalance > 0));
  };

  useEffect(() => {
    reloadData();
    return AppStore.subscribe(reloadData);
  }, []);

  const totalOutstandingDebt = customers.reduce((sum, c) => sum + c.currentBalance, 0);

  const openPaymentModal = (c: Customer) => {
    setSelectedCustomer(c);
    setPayAmount(String(c.currentBalance));
    setReferenceNote('');
    setPaymentReceiptNote('');
    setIsPayModalOpen(true);
  };

  const handleCollectPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer) return;
    const amountNum = parseFloat(payAmount);
    if (!amountNum || amountNum <= 0) {
      showToast(t('validPaymentAmount'), 'error');
      return;
    }
    if (amountNum > selectedCustomer.currentBalance) {
      showToast(t('paymentExceedsBalance'), 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const paymentNote = [referenceNote.trim(), paymentReceiptNote.trim()].filter(Boolean).join(' · ');
      const res = AppStore.recordCustomerPayment(
        selectedCustomer.id,
        amountNum,
        payMethod,
        paymentNote
      );
      setIsPayModalOpen(false);
      setReceiptData({
        receiptNumber: res.receiptNumber,
        customer: res.customer,
        amount: amountNum,
        method: payMethod,
        date: new Date().toLocaleString(),
        note: paymentNote,
      });
      showToast(`${t('paymentRecorded')} $${amountNum}`, 'success');
    } catch (err: any) {
      showToast(err.message || t('paymentRecordingFailed'), 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const minDebtNum = parseFloat(minDebt) || 0;
  const filteredDebtors = customers.filter((c) => {
    const matchesSearch =
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.phone.includes(searchQuery) ||
      c.customerId.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch && c.currentBalance >= minDebtNum;
  });

  const handleExportPDF = () => {
    exportCustomerOutstandingDebtsPDF(customers, AppStore.getSettings());
    showToast(t('customerDebtPdfPrepared'), 'success');
  };

  const handleExportExcel = () => {
    const headers = [
      'Customer ID',
      'Debtor Name',
      'Phone Number',
      'Total Credit',
      'Total Payments',
      'Outstanding Debt',
    ];
    const rows = filteredDebtors.map((c) => [
      c.customerId,
      c.name,
      c.phone,
      `$${c.totalCredit.toFixed(2)}`,
      `$${c.totalPayments.toFixed(2)}`,
      `$${c.currentBalance.toFixed(2)}`,
    ]);
    exportToExcel('Customer_Debts_Report', headers, rows);
    showToast(t('customerDebtsExported'), 'success');
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            {t('customerDebtsReceivables')}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {t('customerDebtPageDescription')}
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handleExportExcel}
            className="px-4 py-2 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-200 shadow-xs flex items-center gap-1.5 transition cursor-pointer"
          >
            <FileDown className="w-3.5 h-3.5 text-emerald-600" />
            <span>{t('exportExcel')}</span>
          </button>
          <button
            onClick={handleExportPDF}
            className="px-4 py-2 rounded-xl text-xs font-bold border border-rose-200 dark:border-rose-900 bg-white dark:bg-slate-800 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 shadow-xs flex items-center gap-1.5 transition cursor-pointer"
          >
            <FileDown className="w-3.5 h-3.5 text-rose-600" />
            <span>{t('exportPDF')}</span>
          </button>
        </div>
      </div>

      {/* Red Banner - exact matching screenshot 13 */}
      <div className="bg-rose-600 rounded-3xl p-6 sm:p-7 text-white shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-rose-100">
            {t('totalCustomerReceivables')}
          </span>
          <div className="text-3xl sm:text-4xl font-black font-mono">
            {AppStore.formatMoney(totalOutstandingDebt)}
          </div>
          <div className="text-xs text-rose-100">
            {customers.length} {t('customerAccountsOwe')}
          </div>
        </div>

        <div className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-white/15 backdrop-blur-xs text-xs font-semibold self-start md:self-auto border border-white/20">
          <AlertCircle className="w-4 h-4 text-white shrink-0" />
          <span>{t('rasiidPaymentsAutomatic')}</span>
        </div>
      </div>

      {/* Search & Min Debt filter card */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative w-full md:w-96">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder={t('searchDebtor')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-2xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium"
          />
        </div>

        <div className="flex items-center gap-2 text-xs font-bold self-end md:self-auto">
          <span className="text-slate-500">{t('minDebt')}</span>
          <input
            type="number"
            step="0.01"
            value={minDebt}
            onChange={(e) => setMinDebt(e.target.value)}
            className="w-20 px-2 py-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-right font-mono font-bold"
          />
        </div>
      </div>

      {/* Table matching screenshot */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/60 dark:bg-slate-800/40 text-slate-400 border-b border-slate-100 dark:border-slate-800 uppercase font-bold text-[10px] tracking-wider">
              <tr>
                <th className="py-3.5 px-4">{t('customerIdUpper')}</th>
                <th className="py-3.5 px-4">{t('debtorNameUpper')}</th>
                <th className="py-3.5 px-4">{t('phoneNumberUpper')}</th>
                <th className="py-3.5 px-4">{t('totalCreditUpper')}</th>
                <th className="py-3.5 px-4">{t('totalPaymentsUpper')}</th>
                <th className="py-3.5 px-4">{t('outstandingDebtUpper')}</th>
                <th className="py-3.5 px-4 text-right">{t('actionUpper')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredDebtors.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-slate-400 text-xs">
                    {t('noDebtsOutstanding')}
                  </td>
                </tr>
              ) : (
                filteredDebtors.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition">
                    <td className="py-3.5 px-4 font-mono font-bold text-slate-600 dark:text-slate-400">
                      {c.customerId}
                    </td>
                    <td className="py-3.5 px-4 font-bold text-slate-900 dark:text-white">
                      {c.name}
                    </td>
                    <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300 font-mono">
                      {c.phone}
                    </td>
                    <td className="py-3.5 px-4 font-mono font-semibold text-slate-800 dark:text-slate-200">
                      {AppStore.formatMoney(c.totalCredit)}
                    </td>
                    <td className="py-3.5 px-4 font-mono font-semibold text-emerald-600">
                      {AppStore.formatMoney(c.totalPayments)}
                    </td>
                    <td className="py-3.5 px-4 font-mono font-black text-rose-600">
                      {AppStore.formatMoney(c.currentBalance)}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={() => openPaymentModal(c)}
                        className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs flex items-center gap-1.5 ml-auto cursor-pointer"
                      >
                        <DollarSign className="w-3.5 h-3.5" />
                        <span>{t('collectDebt')}</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Collect Payment Modal */}
      {isPayModalOpen && selectedCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-sm shadow-2xl p-4 space-y-3">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                <Receipt className="w-4 h-4 text-emerald-600" />
                <span>{t('recordCustomerPayment')}</span>
              </h3>
              <button onClick={() => setIsPayModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCollectPayment} className="space-y-3 text-xs">
              <div className="flex items-center justify-between gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 dark:border-rose-900 dark:bg-rose-950/40">
                <div>
                  <div className="text-[10px] font-semibold text-rose-600">{t('customerBalanceOwed')}</div>
                  <div className="text-[10px] text-slate-500">{selectedCustomer.name}</div>
                </div>
                <div className="font-mono text-xs font-black text-rose-600">{AppStore.formatMoney(selectedCustomer.currentBalance)}</div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {t('paymentAmountRequired')}
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-black rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-emerald-600"
                />
                <div className="mt-1 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setPayAmount(String(selectedCustomer.currentBalance))}
                    className="text-[10px] font-bold text-emerald-700 hover:underline cursor-pointer"
                  >
                    {t('payFullBalance')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPayAmount((selectedCustomer.currentBalance / 2).toFixed(2))}
                    className="text-[10px] font-semibold text-slate-500 hover:underline cursor-pointer"
                  >
                    {t('payHalfBalance')}
                  </button>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {t('paymentMethod')}
                </label>
                <select
                  value={payMethod}
                  onChange={(event) => setPayMethod(event.target.value as PaymentMethod)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800"
                >
                  <option value="cash">{t('cash')}</option>
                  <option value="evc_plus">EVC Plus</option>
                  <option value="zaad">Zaad</option>
                  <option value="sahal">Sahal</option>
                  <option value="premier_wallet">Premier Wallet</option>
                  <option value="card">{t('card')}</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {t('transactionMobileReference')}
                </label>
                <input
                  type="text"
                  value={referenceNote}
                  onChange={(e) => setReferenceNote(e.target.value)}
                  placeholder={t('exampleTrxId')}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {t('receiptNote')}
                </label>
                <input
                  type="text"
                  value={paymentReceiptNote}
                  onChange={(e) => setPaymentReceiptNote(e.target.value)}
                  placeholder={t('debtInstallmentPlaceholder')}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsPayModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  {t('cancel')}
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center gap-2 shadow-sm"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{t('confirmSavePayment')}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Payment Receipt Modal */}
      {receiptData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-sm shadow-2xl p-6 space-y-4 font-mono text-xs">
            <div className="text-center pb-2 border-b border-dashed border-slate-300 dark:border-slate-700">
              <div className="font-black text-sm uppercase text-slate-900 dark:text-white">
                {AppStore.getSettings().businessName}
              </div>
              <div className="text-[10px] text-slate-400">{t('debtPaymentReceipt')}</div>
              <div className="text-xs font-bold text-emerald-600 mt-1">{receiptData.receiptNumber}</div>
            </div>

            <div className="space-y-1 py-1">
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>{t('customerLabel')}</span>
                <span className="font-bold text-slate-900 dark:text-white">{receiptData.customer.name}</span>
              </div>
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>{t('method')}:</span>
                <span className="uppercase">{receiptData.method}</span>
              </div>
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>{t('date')}:</span>
                <span>{receiptData.date}</span>
              </div>
            </div>

            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 rounded-xl border border-emerald-200 dark:border-emerald-800 flex justify-between items-center text-sm">
              <span className="font-bold text-emerald-800 dark:text-emerald-300">{t('paidAmount')}:</span>
              <span className="font-black text-emerald-600">{AppStore.formatMoney(receiptData.amount)}</span>
            </div>

            <div className="flex justify-between text-slate-700 dark:text-slate-300 pt-1">
              <span>{t('remainingBalance')}</span>
              <span className="font-black text-rose-600">{AppStore.formatMoney(receiptData.customer.currentBalance)}</span>
            </div>

            <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={() => setReceiptData(null)}
                className="flex-1 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
              >
                {t('close')}
              </button>
              <button
                onClick={() => {
                  window.print();
                  showToast(t('receiptPrinterSent'), 'success');
                }}
                className="flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center justify-center gap-1.5"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>{t('printReceipt')}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
