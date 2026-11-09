import React from 'react';
import {
  BarChart3,
  CircleDollarSign,
  CreditCard,
  Home,
  Menu,
  Package,
  QrCode,
  Receipt,
  ShoppingCart,
  Store,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

interface MobileNavigationProps {
  onOpenMenu: () => void;
}

export const MobileNavigation: React.FC<MobileNavigationProps> = ({ onOpenMenu }) => {
  const { activeTab, setActiveTab, activeUser, t } = useApp();

  const items = activeUser.role === 'cashier'
    ? [
        { id: 'pos', label: t('mobilePOS'), icon: ShoppingCart },
        { id: 'scanner', label: t('mobileScan'), icon: QrCode },
        { id: 'pos_invoices', label: t('mobileReceipts'), icon: Receipt },
      ]
    : activeUser.role === 'accountant'
      ? [
          { id: 'home', label: t('mobileHome'), icon: Home },
          { id: 'customer_debts', label: t('mobileDebts'), icon: CreditCard },
          { id: 'supplier_debts', label: t('mobileSuppliers'), icon: Store },
          { id: 'report_sales', label: t('mobileReports'), icon: BarChart3 },
          { id: 'account', label: t('navAccount'), icon: CircleDollarSign },
        ]
      : [
          { id: 'home', label: t('mobileHome'), icon: Home },
          { id: 'pos', label: t('mobilePOS'), icon: ShoppingCart },
          { id: 'products', label: t('mobileProducts'), icon: Package },
          { id: 'customer_debts', label: t('mobileDebts'), icon: CreditCard },
          ...(activeUser.role === 'admin'
            ? [{ id: 'account', label: t('navAccount'), icon: CircleDollarSign }]
            : []),
        ];

  return (
    <nav
      aria-label={t('mobileNavigation')}
      className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-1 pt-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))] shadow-[0_-4px_18px_rgba(15,23,42,0.08)] backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 lg:hidden"
    >
      <div className="mx-auto flex max-w-lg items-stretch justify-around">
        {items.map(({ id, label, icon: Icon }) => {
          const selected = activeTab === id || (id === 'report_sales' && activeTab.startsWith('report_'));

          return (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              aria-current={selected ? 'page' : undefined}
              className={`flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[10px] font-semibold transition-colors ${
                selected
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100'
              }`}
            >
              <Icon className={`h-5 w-5 ${selected ? 'stroke-[2.5]' : ''}`} aria-hidden="true" />
              <span className="max-w-full truncate">{label}</span>
            </button>
          );
        })}

        <button
          type="button"
          onClick={onOpenMenu}
          aria-label={t('mobileMore')}
          className="flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[10px] font-semibold text-slate-500 transition-colors hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
          <span className="max-w-full truncate">{t('mobileMore')}</span>
        </button>
      </div>
    </nav>
  );
};
