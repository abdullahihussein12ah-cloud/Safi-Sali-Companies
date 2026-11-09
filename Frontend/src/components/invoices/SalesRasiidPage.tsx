import React, { useState, useEffect } from 'react';
import {
  DollarSign,
  Receipt,
  User,
  Plus,
  Calendar,
  X,
  CheckCircle2,
  Printer,
  Smartphone,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { AppStore } from '../../services/store';
import { Customer, CustomerLedgerEntry, SaleInvoice, PaymentMethod } from '../../types';
import { exportCustomerProfilePDF } from '../../utils/exports';

export const SalesRasiidPage: React.FC = () => {
  const { showToast } = useApp();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [ledgerEntries, setLedgerEntries] = useState<CustomerLedgerEntry[]>([]);
  const [customerInvoices, setCustomerInvoices] = useState<SaleInvoice[]>([]);

  // Record Payment Modal
  const [isRecordPayOpen, setIsRecordPayOpen] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState<PaymentMethod>('evc_plus');
  const [payNote, setPayNote] = useState('');

  const reloadData = () => {
    const custs = AppStore.getCustomers();
    setCustomers(custs);
    if (!selectedCustomerId && custs.length > 0) {
      setSelectedCustomerId(custs[0].id);
    }
  };

  useEffect(() => {
    reloadData();
    return AppStore.subscribe(reloadData);
  }, []);

  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId);

  useEffect(() => {
    if (selectedCustomer) {
      setLedgerEntries(AppStore.getCustomerLedger(selectedCustomer.id));
      const allSales = AppStore.getSales();
      setCustomerInvoices(allSales.filter((s) => s.customerId === selectedCustomer.id));
    }
  }, [selectedCustomerId, customers]);

  const handleRecordPaymentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer) {
      showToast('Select a customer first', 'error');
      return;
    }
    const num = parseFloat(payAmount);
    if (!num || num <= 0) {
      showToast('Please enter a valid payment amount', 'error');
      return;
    }

    try {
      AppStore.recordCustomerPayment(selectedCustomer.id, num, payMethod, payNote);
      setIsRecordPayOpen(false);
      setPayAmount('');
      setPayNote('');
      showToast(`Rasiid payment of $${num} recorded!`, 'success');
      reloadData();
    } catch (err: any) {
      showToast(err.message || 'Error recording payment', 'error');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header matching screenshot 7 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            Sales & Rasiid (Customer Ledger)
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Manage customer credit sales, Rasiid payments, account ledgers, and printable official receipts
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setIsRecordPayOpen(true)}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm flex items-center gap-1.5 transition cursor-pointer"
          >
            <DollarSign className="w-4 h-4" />
            <span>Record Payment (Rasiid)</span>
          </button>
        </div>
      </div>

      {/* Customer Selector Card matching screenshot 7 */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-xs flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 shrink-0">
          <User className="w-4 h-4" />
        </div>

        <select
          value={selectedCustomerId}
          onChange={(e) => setSelectedCustomerId(e.target.value)}
          className="flex-1 px-3 py-2 rounded-2xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-medium cursor-pointer"
        >
          {customers.length === 0 ? (
            <option value="">No customers available. Please add customer in Directory.</option>
          ) : (
            customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.customerId}) - Balance: {AppStore.formatMoney(c.currentBalance)}
              </option>
            ))
          )}
        </select>
      </div>

      {/* When Customer Selected: Highlights & Ledgers */}
      {selectedCustomer ? (
        <div className="space-y-6">
          {/* Summary metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-4 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
              <span className="text-[10px] text-slate-400 font-bold uppercase">Opening Balance</span>
              <div className="text-xl font-bold text-slate-900 dark:text-white mt-1 font-mono">
                {AppStore.formatMoney(selectedCustomer.openingBalance)}
              </div>
            </div>

            <div className="p-4 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
              <span className="text-[10px] text-slate-400 font-bold uppercase">Total Credit Granted</span>
              <div className="text-xl font-bold text-rose-600 mt-1 font-mono">
                {AppStore.formatMoney(selectedCustomer.totalCredit)}
              </div>
            </div>

            <div className="p-4 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
              <span className="text-[10px] text-slate-400 font-bold uppercase">Total Payments Settled</span>
              <div className="text-xl font-bold text-emerald-600 mt-1 font-mono">
                {AppStore.formatMoney(selectedCustomer.totalPayments)}
              </div>
            </div>

            <div className="p-4 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
              <span className="text-[10px] text-slate-400 font-bold uppercase">Outstanding Due (Deyn)</span>
              <div className="text-xl font-black text-rose-600 mt-1 font-mono">
                {AppStore.formatMoney(selectedCustomer.currentBalance)}
              </div>
            </div>
          </div>

          {/* Ledger vs Invoices Split */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: Customer Ledger Entries */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-emerald-500" />
                  <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                    Customer Ledger (Rasiid Entries)
                  </h3>
                </div>
                <span className="text-xs text-slate-400 font-mono">{ledgerEntries.length} entries</span>
              </div>

              <div className="space-y-2.5 max-h-96 overflow-y-auto">
                {ledgerEntries.length === 0 ? (
                  <div className="text-center py-12 text-xs text-slate-400">
                    No ledger transactions recorded for this account.
                  </div>
                ) : (
                  ledgerEntries.map((entry) => (
                    <div
                      key={entry.id}
                      className="p-3 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex items-center justify-between text-xs"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase ${
                              entry.type === 'payment'
                                ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                                : 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300'
                            }`}
                          >
                            {entry.type.replace('_', ' ')}
                          </span>
                          <span className="font-mono text-slate-400 font-semibold">{entry.reference}</span>
                        </div>
                        <div className="font-semibold text-slate-800 dark:text-slate-200 mt-1">
                          {entry.notes}
                        </div>
                        <div className="text-[10px] text-slate-400">{entry.date}</div>
                      </div>
                      <div className="text-right">
                        <div
                          className={`font-mono font-black text-sm ${
                            entry.type === 'payment' ? 'text-emerald-600' : 'text-slate-900 dark:text-white'
                          }`}
                        >
                          {entry.type === 'payment' ? '-' : '+'}
                          {AppStore.formatMoney(entry.amount)}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          Bal: {AppStore.formatMoney(entry.newBalance)}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Right: Invoices Issued to Customer */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-emerald-500" />
                  <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                    Invoices Issued to Customer
                  </h3>
                </div>
                <span className="text-xs text-slate-400 font-mono">{customerInvoices.length} invoices</span>
              </div>

              <div className="space-y-2.5 max-h-96 overflow-y-auto">
                {customerInvoices.length === 0 ? (
                  <div className="text-center py-12 text-xs text-slate-400">
                    No invoices issued to this customer.
                  </div>
                ) : (
                  customerInvoices.map((inv) => (
                    <div
                      key={inv.id}
                      className="p-3 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex items-center justify-between text-xs"
                    >
                      <div>
                        <div className="font-mono font-bold text-emerald-600">{inv.invoiceNumber}</div>
                        <div className="text-[10px] text-slate-400">{inv.date} · {inv.cashierName}</div>
                        <div className="text-slate-600 dark:text-slate-300 mt-0.5">
                          {inv.items.map((i) => `${i.productName} (x${i.quantity})`).join(', ')}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-black font-mono text-slate-900 dark:text-white">
                          {AppStore.formatMoney(inv.totalAmount)}
                        </div>
                        <span
                          className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase ${
                            inv.paymentStatus === 'paid'
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                              : 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                          }`}
                        >
                          {inv.paymentStatus}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-16 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 text-center text-slate-400 text-xs">
          Select a customer above to view ledger statements and record Rasiid payments.
        </div>
      )}

      {/* Record Payment Modal */}
      {isRecordPayOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-md shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-bold text-base text-slate-900 dark:text-white">
                Record Payment (Rasiid)
              </h3>
              <button onClick={() => setIsRecordPayOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleRecordPaymentSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Customer
                </label>
                <select
                  value={selectedCustomerId}
                  onChange={(e) => setSelectedCustomerId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                >
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.customerId}) - Owed: ${c.currentBalance.toFixed(2)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Payment Amount ($) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3 py-2 text-sm font-bold font-mono rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Payment Method
                </label>
                <select
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                >
                  <option value="evc_plus">Hormuud EVC Plus</option>
                  <option value="zaad">Telesom Zaad</option>
                  <option value="sahal">Golis Sahal</option>
                  <option value="premier_wallet">Premier Wallet</option>
                  <option value="cash">Cash (Kaash)</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Reference / Memo
                </label>
                <input
                  type="text"
                  value={payNote}
                  onChange={(e) => setPayNote(e.target.value)}
                  placeholder="e.g. Trx ID #EV-99124"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsRecordPayOpen(false)}
                  className="px-4 py-2 rounded-xl font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl font-bold bg-emerald-600 hover:bg-emerald-500 text-white"
                >
                  Save & Issue Rasiid
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
