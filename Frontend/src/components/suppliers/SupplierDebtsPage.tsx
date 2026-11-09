import React, { useState, useEffect } from 'react';
import {
  DollarSign,
  FileDown,
  X,
  CheckCircle2,
  Store,
  Truck,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { AppStore } from '../../services/store';
import { Supplier } from '../../types';
import { exportSupplierDebtsPDF, exportToExcel } from '../../utils/exports';

export const SupplierDebtsPage: React.FC = () => {
  const { showToast } = useApp();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);

  // Pay Modal
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('EVC Plus / Bank Wire');
  const [payNote, setPayNote] = useState('');

  const reloadData = () => {
    const list = AppStore.getSuppliers();
    setSuppliers(list.filter((s) => s.currentBalance > 0));
  };

  useEffect(() => {
    reloadData();
    return AppStore.subscribe(reloadData);
  }, []);

  const totalOwed = suppliers.reduce((sum, s) => sum + s.currentBalance, 0);

  const openPayModal = (s: Supplier) => {
    setSelectedSupplier(s);
    setPayAmount(String(s.currentBalance));
    setPayNote(`Vendor disbursement for ${s.name}`);
    setIsPayModalOpen(true);
  };

  const handlePaySupplier = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSupplier) return;
    const num = parseFloat(payAmount);
    if (!num || num <= 0) {
      showToast('Please enter a valid amount', 'error');
      return;
    }

    try {
      AppStore.recordSupplierPayment(selectedSupplier.id, num, payMethod, payNote);
      setIsPayModalOpen(false);
      showToast(`Disbursement of $${num} recorded!`, 'success');
      reloadData();
    } catch (err: any) {
      showToast(err.message || 'Payment recording failed', 'error');
    }
  };

  const handleExportPDF = () => {
    exportSupplierDebtsPDF(suppliers, AppStore.getSettings());
    showToast('Supplier debts PDF statement generated', 'success');
  };

  const handleExportExcel = () => {
    const headers = [
      'SUPPLIER ID',
      'SUPPLIER NAME',
      'CONTACT',
      'PHONE',
      'TOTAL PURCHASES',
      'TOTAL PAID',
      'AMOUNT WE OWE',
    ];
    const rows = suppliers.map((s) => [
      s.supplierId,
      s.name,
      s.contactPerson,
      s.phone,
      `$${s.totalPurchases.toFixed(2)}`,
      `$${s.totalPayments.toFixed(2)}`,
      `$${s.currentBalance.toFixed(2)}`,
    ]);
    exportToExcel('Supplier_Accounts_Payable_Report', headers, rows);
    showToast('Supplier debts report exported to Excel', 'success');
  };

  return (
    <div className="space-y-6">
      {/* Top Header matching exact screenshot 16 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            Supplier Debts & Accounts Payable
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Track payments owed to vendors and record bank wire or cash disbursements
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handleExportExcel}
            className="px-4 py-2 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-200 shadow-xs flex items-center gap-1.5 transition cursor-pointer"
          >
            <FileDown className="w-3.5 h-3.5 text-emerald-600" />
            <span>Excel</span>
          </button>
          <button
            onClick={handleExportPDF}
            className="px-4 py-2 rounded-xl text-xs font-bold border border-rose-200 dark:border-rose-900 bg-white dark:bg-slate-800 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 shadow-xs flex items-center gap-1.5 transition cursor-pointer"
          >
            <FileDown className="w-3.5 h-3.5 text-rose-600" />
            <span>PDF</span>
          </button>
        </div>
      </div>

      {/* Red Banner matching exact screenshot 16 */}
      <div className="bg-rose-600 rounded-3xl p-6 sm:p-7 text-white shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-rose-100">
            TOTAL OUTSTANDING SUPPLIER PAYABLES
          </span>
          <div className="text-3xl sm:text-4xl font-black font-mono">
            {AppStore.formatMoney(totalOwed)}
          </div>
          <div className="text-xs text-rose-100">
            Amount owed to {suppliers.length} distributors and merchandise suppliers
          </div>
        </div>

        <button
          onClick={handleExportPDF}
          className="px-5 py-2.5 rounded-2xl bg-white/15 hover:bg-white/25 border border-white/20 text-xs font-bold flex items-center gap-2 self-start md:self-auto cursor-pointer"
        >
          <Truck className="w-4 h-4" />
          <span>VENDOR LEDGER</span>
        </button>
      </div>

      {/* Table matching screenshot 16 */}
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
                <th className="py-3.5 px-4">AMOUNT WE OWE</th>
                <th className="py-3.5 px-4 text-right">ACTION</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {suppliers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-slate-500 text-xs">
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <div className="w-10 h-10 rounded-full bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center text-emerald-600">
                        <CheckCircle2 className="w-5 h-5" />
                      </div>
                      <span className="font-semibold text-slate-600 dark:text-slate-300">
                        No outstanding supplier debts! All vendor accounts are fully paid.
                      </span>
                    </div>
                  </td>
                </tr>
              ) : (
                suppliers.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition">
                    <td className="py-3.5 px-4 font-mono font-bold text-slate-600 dark:text-slate-400">
                      {s.supplierId}
                    </td>
                    <td className="py-3.5 px-4 font-bold text-slate-900 dark:text-white">
                      {s.name}
                    </td>
                    <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300">
                      {s.contactPerson}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-slate-500">
                      {s.phone}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-slate-700 dark:text-slate-300">
                      {AppStore.formatMoney(s.totalPurchases)}
                    </td>
                    <td className="py-3.5 px-4 font-mono font-semibold text-emerald-600">
                      {AppStore.formatMoney(s.totalPayments)}
                    </td>
                    <td className="py-3.5 px-4 font-mono font-black text-rose-600">
                      {AppStore.formatMoney(s.currentBalance)}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={() => openPayModal(s)}
                        className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs flex items-center gap-1.5 ml-auto cursor-pointer"
                      >
                        <DollarSign className="w-3.5 h-3.5" />
                        <span>Disburse Payment</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pay Modal */}
      {isPayModalOpen && selectedSupplier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-md shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-bold text-base text-slate-900 dark:text-white">
                Disburse Payment to Supplier
              </h3>
              <button onClick={() => setIsPayModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handlePaySupplier} className="space-y-4 text-xs">
              <div className="p-3.5 bg-slate-50 dark:bg-slate-800 rounded-2xl space-y-1">
                <div className="text-slate-400">Vendor Account:</div>
                <div className="text-sm font-bold text-slate-900 dark:text-white">
                  {selectedSupplier.name} ({selectedSupplier.supplierId})
                </div>
                <div className="text-amber-600 font-bold font-mono">
                  Amount Owed: {AppStore.formatMoney(selectedSupplier.currentBalance)}
                </div>
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
                  className="w-full px-3 py-2 text-sm font-bold rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Method
                </label>
                <input
                  type="text"
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Reference Note
                </label>
                <input
                  type="text"
                  value={payNote}
                  onChange={(e) => setPayNote(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsPayModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl font-bold bg-emerald-600 hover:bg-emerald-500 text-white"
                >
                  Record Disbursement
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
