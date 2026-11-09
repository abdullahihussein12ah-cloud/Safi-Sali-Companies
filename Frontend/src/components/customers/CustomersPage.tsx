import React, { useState, useEffect } from 'react';
import {
  UserPlus,
  Search,
  FileDown,
  X,
  FileText,
  Edit2,
  Trash2,
  CheckCircle2,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { AppStore } from '../../services/store';
import { Customer } from '../../types';
import { exportCustomerProfilePDF, exportToExcel } from '../../utils/exports';

export const CustomersPage: React.FC = () => {
  const { showToast, t } = useApp();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);

  // Form Fields
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('+252 61 ');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('Mogadishu, Somalia');
  const [openingBalance, setOpeningBalance] = useState<number>(0);
  const [creditLimit, setCreditLimit] = useState<number>(500);
  const [notes, setNotes] = useState('');

  const reloadData = () => {
    setCustomers(AppStore.getCustomers());
  };

  useEffect(() => {
    reloadData();
    return AppStore.subscribe(reloadData);
  }, []);

  const openCreateModal = () => {
    setEditingCustomer(null);
    setName('');
    setPhone('+252 61 ');
    setEmail('');
    setAddress('Mogadishu, Somalia');
    setOpeningBalance(0);
    setCreditLimit(500);
    setNotes('');
    setIsModalOpen(true);
  };

  const openEditModal = (c: Customer) => {
    setEditingCustomer(c);
    setName(c.name);
    setPhone(c.phone);
    setEmail(c.email || '');
    setAddress(c.address || '');
    setOpeningBalance(c.openingBalance);
    setCreditLimit(c.creditLimit || 500);
    setNotes(c.notes || '');
    setIsModalOpen(true);
  };

  const handleSaveCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) {
      showToast(t('customerNamePhoneRequired'), 'error');
      return;
    }

    try {
      const savedCustomer = AppStore.saveCustomer({
        id: editingCustomer?.id,
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim(),
        address: address.trim(),
        openingBalance: Number(openingBalance),
        creditLimit: Number(creditLimit),
        notes,
        status: 'active',
      });
      setIsModalOpen(false);
      showToast(
        editingCustomer ? t('customerUpdated') : t('customerCreated'),
        'success'
      );
      if (!editingCustomer) {
        exportCustomerProfilePDF(savedCustomer, AppStore.getSettings());
      }
    } catch (err: any) {
      showToast(err.message || t('customerSaveFailed'), 'error');
    }
  };

  const handleDeleteCustomer = async (customer: Customer) => {
    if (!window.confirm(t('deleteCustomerConfirm').replace('{name}', customer.name))) {
      return;
    }

    try {
      await AppStore.deleteCustomer(customer.id);
      showToast(t('customerDeleted').replace('{name}', customer.name), 'success');
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Failed to delete customer', 'error');
    }
  };

  const filteredCustomers = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.phone.includes(searchQuery) ||
      c.customerId.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const debtsCount = customers.filter((c) => c.currentBalance > 0).length;

  const handleExportExcel = () => {
    const headers = [
      'Customer ID',
      'Full Name',
      'Phone Number',
      'Opening Bal',
      'Total Credit',
      'Total Paid',
      'Current Balance',
    ];
    const rows = filteredCustomers.map((c) => [
      c.customerId,
      c.name,
      c.phone,
      `$${c.openingBalance.toFixed(2)}`,
      `$${c.totalCredit.toFixed(2)}`,
      `$${c.totalPayments.toFixed(2)}`,
      `$${c.currentBalance.toFixed(2)}`,
    ]);
    exportToExcel('Customer_Directory_Report', headers, rows);
    showToast(t('customerDirectoryExported'), 'success');
  };

  return (
    <div className="space-y-6">
      {/* Top Header matching exact screenshot */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            {t('customerDirectoryCreditAccounts')}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {t('customerDirectoryDescription')}
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handleExportExcel}
            className="px-4 py-2 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-200 shadow-xs flex items-center gap-1.5 transition cursor-pointer"
          >
            <FileDown className="w-3.5 h-3.5 text-emerald-600" />
            <span>{t('exportExcelButton')}</span>
          </button>

          <button
            onClick={openCreateModal}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm flex items-center gap-1.5 transition cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>{t('addCustomer')}</span>
          </button>
        </div>
      </div>

      {/* Search Bar with live stats */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative w-full md:w-96">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder={t('searchCustomers')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-2xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium"
          />
        </div>

        <div className="flex items-center gap-4 text-xs font-bold self-end md:self-auto">
          <span className="text-slate-600 dark:text-slate-400">
            {t('totalCustomersLabel')} <span className="text-emerald-600 font-mono">{customers.length}</span>
          </span>
          <span className="text-slate-600 dark:text-slate-400">
            {t('withDebts')} <span className="text-rose-600 font-mono">{debtsCount}</span>
          </span>
        </div>
      </div>

      {/* Customers Table */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/60 dark:bg-slate-800/40 text-slate-400 border-b border-slate-100 dark:border-slate-800 uppercase font-bold text-[10px] tracking-wider">
              <tr>
                <th className="py-3.5 px-4">{t('customerIdUpper')}</th>
                <th className="py-3.5 px-4">{t('fullNameUpper')}</th>
                <th className="py-3.5 px-4">{t('phoneNumberUpper')}</th>
                <th className="py-3.5 px-4">{t('openingBalanceUpper')}</th>
                <th className="py-3.5 px-4">{t('totalCreditUpper')}</th>
                <th className="py-3.5 px-4">{t('totalPaidUpper')}</th>
                <th className="py-3.5 px-4">{t('currentBalanceUpper')}</th>
                <th className="py-3.5 px-4 text-right">{t('actions').toUpperCase()}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-slate-400 text-xs">
                    {t('noCustomersFound')}
                  </td>
                </tr>
              ) : (
                filteredCustomers.map((c) => (
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
                    <td className="py-3.5 px-4 font-mono text-slate-600 dark:text-slate-400">
                      {AppStore.formatMoney(c.openingBalance)}
                    </td>
                    <td className="py-3.5 px-4 font-mono font-semibold text-rose-600">
                      {AppStore.formatMoney(c.totalCredit)}
                    </td>
                    <td className="py-3.5 px-4 font-mono font-semibold text-emerald-600">
                      {AppStore.formatMoney(c.totalPayments)}
                    </td>
                    <td className="py-3.5 px-4">
                      {c.currentBalance > 0 ? (
                        <span className="font-mono font-black text-rose-600 px-2 py-0.5 rounded-full bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900/60">
                          {AppStore.formatMoney(c.currentBalance)}
                        </span>
                      ) : (
                        <span className="font-mono font-semibold text-emerald-600 px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60">
                          $0.00
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => exportCustomerProfilePDF(c, AppStore.getSettings())}
                          title={t('generateStatement')}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                        >
                          <FileText className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => openEditModal(c)}
                          title={t('editCustomer')}
                          aria-label={`${t('editCustomer')} ${c.name}`}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteCustomer(c)}
                          title={t('deleteCustomer')}
                          aria-label={`${t('deleteCustomer')} ${c.name}`}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Customer Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-md shadow-2xl p-5 space-y-3.5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-bold text-slate-900 dark:text-white text-base">
                {editingCustomer ? t('editCustomerInformation') : t('registerNewCustomer')}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCustomer} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {t('fullNameRequired')}
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('exampleCustomer')}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {t('phoneNumberRequired')}
                  </label>
                  <input
                    type="text"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+252 61 ..."
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {t('emailAddress')}
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t('customerEmailPlaceholder')}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {t('addressDistrict')}
                  </label>
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder={t('exampleDistrict')}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {t('openingDebtBalance')}
                  </label>
                  <input
                    type="number"
                    value={openingBalance}
                    onChange={(e) => setOpeningBalance(parseFloat(e.target.value) || 0)}
                    placeholder="0"
                    readOnly={Boolean(editingCustomer)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono read-only:bg-slate-100 dark:read-only:bg-slate-800"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {t('notesCreditLimit')}
                </label>
                <div className="grid grid-cols-[minmax(0,1fr)_112px] gap-2">
                  <textarea
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder={t('customerNotesCreditPlaceholder')}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                  />
                  <div>
                    <label className="mb-1 block text-[10px] font-semibold text-slate-500">{t('creditLimit')}</label>
                    <input
                      type="number"
                      min="0"
                      value={creditLimit}
                      onChange={(e) => setCreditLimit(parseFloat(e.target.value) || 0)}
                      className="w-full px-2.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl font-semibold text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  {t('cancel')}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm"
                >
                  {editingCustomer ? t('saveCustomer') : t('saveGeneratePDF')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
