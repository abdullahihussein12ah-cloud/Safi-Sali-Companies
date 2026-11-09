import React, { useState, useEffect } from 'react';
import {
  Building2,
  Plus,
  Search,
  FileDown,
  X,
  Edit2,
  Trash2,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { AppStore } from '../../services/store';
import { Supplier } from '../../types';
import { exportToExcel } from '../../utils/exports';

export const SuppliersPage: React.FC = () => {
  const { showToast, t } = useApp();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);

  // Form Fields
  const [name, setName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [phone, setPhone] = useState('+252 61 ');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [openingBalance, setOpeningBalance] = useState<number>(0);
  const [notes, setNotes] = useState('');

  const reloadData = () => {
    setSuppliers(AppStore.getSuppliers());
  };

  useEffect(() => {
    reloadData();
    return AppStore.subscribe(reloadData);
  }, []);

  const totalPayables = suppliers.reduce((sum, s) => sum + (s.currentBalance > 0 ? s.currentBalance : 0), 0);

  const openCreateModal = () => {
    setEditingSupplier(null);
    setName('');
    setContactPerson('');
    setPhone('+252 61 ');
    setEmail('');
    setAddress('');
    setOpeningBalance(0);
    setNotes('');
    setIsModalOpen(true);
  };

  const openEditModal = (s: Supplier) => {
    setEditingSupplier(s);
    setName(s.name);
    setContactPerson(s.contactPerson);
    setPhone(s.phone);
    setEmail(s.email || '');
    setAddress(s.address || '');
    setOpeningBalance(s.openingBalance);
    setNotes(s.notes || '');
    setIsModalOpen(true);
  };

  const handleDeleteSupplier = async (id: string, supplierName: string) => {
    if (window.confirm(t('deleteSupplierConfirm').replace('{name}', supplierName))) {
      try {
        await AppStore.deleteSupplier(id);
        showToast(t('supplierDeleted').replace('{name}', supplierName), 'success');
      } catch (error) {
        showToast(error instanceof Error ? error.message : 'Failed to move supplier to the Recycling Bin.', 'error');
      }
    }
  };

  const handleSaveSupplier = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || phone.replace(/\D/g, '').length < 9) {
      showToast(t('supplierNamePhoneRequired'), 'error');
      return;
    }

    try {
      AppStore.saveSupplier({
        id: editingSupplier?.id,
        name: name.trim(),
        contactPerson: contactPerson.trim() || name.trim(),
        phone: phone.trim(),
        email: email.trim(),
        address: address.trim(),
        openingBalance: Number.isFinite(openingBalance) ? Math.max(0, openingBalance) : 0,
        notes: notes.trim(),
        status: 'active',
      });
      setIsModalOpen(false);
      showToast(
        editingSupplier ? t('supplierUpdated') : t('supplierRegistered'),
        'success'
      );
    } catch (err: any) {
      showToast(err.message || t('supplierSaveError'), 'error');
    }
  };

  const filteredSuppliers = suppliers.filter(
    (s) =>
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.contactPerson.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.supplierId.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleExportExcel = () => {
    const headers = [
      'SUPPLIER ID',
      'COMPANY NAME',
      'CONTACT PERSON',
      'PHONE',
      'TOTAL PURCHASES',
      'TOTAL PAID',
      'BALANCE (WE OWE)',
    ];
    const rows = filteredSuppliers.map((s) => [
      s.supplierId,
      s.name,
      s.contactPerson,
      s.phone,
      `$${s.totalPurchases.toFixed(2)}`,
      `$${s.totalPayments.toFixed(2)}`,
      `$${s.currentBalance.toFixed(2)}`,
    ]);
    exportToExcel('Suppliers_Vendors_List', headers, rows);
    showToast(t('suppliersExported'), 'success');
  };

  return (
    <div className="space-y-6">
      {/* Top Header matching exact screenshot 12 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            {t('suppliersWholesaleVendors')}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {t('suppliersDescription')}
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
            onClick={openCreateModal}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm flex items-center gap-1.5 transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>{t('addSupplier')}</span>
          </button>
        </div>
      </div>

      {/* Search and Stats Bar matching screenshot 12 */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative w-full md:w-96">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder={t('searchSuppliers')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-2xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium"
          />
        </div>

        <div className="flex items-center gap-4 text-xs font-bold self-end md:self-auto">
          <span className="text-slate-600 dark:text-slate-400">
            {t('totalSuppliersLabel')} <span className="text-emerald-600 font-mono">{suppliers.length}</span>
          </span>
          <span className="text-slate-600 dark:text-slate-400">
            {t('totalPayables')} <span className="text-rose-600 font-mono">{AppStore.formatMoney(totalPayables)}</span>
          </span>
        </div>
      </div>

      {/* Table matching screenshot 12 */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/60 dark:bg-slate-800/40 text-slate-400 border-b border-slate-100 dark:border-slate-800 uppercase font-bold text-[10px] tracking-wider">
              <tr>
                <th className="py-3.5 px-4">{t('supplierId')}</th>
                <th className="py-3.5 px-4">{t('companyName')}</th>
                <th className="py-3.5 px-4">{t('contactPerson')}</th>
                <th className="py-3.5 px-4">{t('phoneUpper')}</th>
                <th className="py-3.5 px-4">{t('totalPurchasesUpper')}</th>
                <th className="py-3.5 px-4">{t('totalPaidUpper')}</th>
                <th className="py-3.5 px-4">{t('balanceWeOwe')}</th>
                <th className="py-3.5 px-4 text-right">{t('actionUpper')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredSuppliers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-slate-400 text-xs">
                    {t('noSuppliersFound')}
                  </td>
                </tr>
              ) : (
                filteredSuppliers.map((s) => (
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
                    <td className="py-3.5 px-4 text-slate-500 font-mono">
                      {s.phone}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-slate-700 dark:text-slate-300">
                      {AppStore.formatMoney(s.totalPurchases)}
                    </td>
                    <td className="py-3.5 px-4 font-mono font-semibold text-emerald-600">
                      {AppStore.formatMoney(s.totalPayments)}
                    </td>
                    <td className="py-3.5 px-4">
                      {s.currentBalance > 0 ? (
                        <span className="font-mono font-black text-rose-600 px-2 py-0.5 rounded-full bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900/60">
                          {AppStore.formatMoney(s.currentBalance)}
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
                          onClick={() => openEditModal(s)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteSupplier(s.id, s.name)}
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

      {/* Add / Edit Supplier Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md shadow-2xl p-5 space-y-3">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-bold text-slate-900 dark:text-white text-base">
                {editingSupplier ? t('editSupplier') : t('addNewSupplier')}
              </h3>
              <button type="button" onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSupplier} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {t('supplierCompanyName')} *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('supplierCompanyNameExample')}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {t('supplierContactPerson')}
                  </label>
                  <input
                    type="text"
                    value={contactPerson}
                    onChange={(e) => setContactPerson(e.target.value)}
                    placeholder={t('supplierContactPersonExample')}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {t('supplierPhoneNumber')} *
                  </label>
                  <input
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder={t('staffPhonePlaceholder')}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {t('supplierEmail')}
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t('supplierEmailExample')}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {t('supplierOpeningDebtBalance')}
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={openingBalance}
                    onChange={(e) => setOpeningBalance(Math.max(0, Number(e.target.value) || 0))}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {t('supplierAddress')}
                </label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder={t('supplierAddressExample')}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl font-semibold text-slate-600 hover:bg-slate-100"
                >
                  {t('cancel')}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm"
                >
                  {t('saveSupplier')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
