import React from 'react';
import { X, Keyboard, Command } from 'lucide-react';
import { useApp } from '../../context/AppContext';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const KeyboardShortcutsModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const { language } = useApp();

  if (!isOpen) return null;

  const shortcuts = [
    { key: 'P', descEn: 'Open Point of Sale (POS)', descSo: 'Fur Goobta Iibka (POS)' },
    { key: 'S', descEn: 'Open QR & Barcode Camera Scanner', descSo: 'Fur Sawiraha QR & Barcode-ka' },
    { key: 'D', descEn: 'Open Customer Debts (Deyn)', descSo: 'Fur Deymaha Macaamiisha' },
    { key: 'R', descEn: 'Open Sales & Financial Reports', descSo: 'Fur Warbixinnada Xisaabaadka' },
    { key: 'N', descEn: 'Add / Register New Product', descSo: 'Ku dar Alaab Cusub' },
    { key: '?', descEn: 'Show Keyboard Shortcuts Help', descSo: 'Muuji Furayaasha Fudud' },
    { key: 'ESC', descEn: 'Close Active Modal or Drawer', descSo: 'Xidh Daaqadda Furan' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/60 p-3 backdrop-blur-xs animate-in fade-in duration-150 sm:items-center sm:p-4">
      <div className="my-auto max-h-[calc(100dvh-1.5rem)] w-full max-w-md overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900 sm:max-h-[calc(100dvh-2rem)]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <Keyboard className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                {language === 'so' ? 'Furayaasha Fudud ee Kiiboodhka' : 'Keyboard Shortcuts'}
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {language === 'so' ? 'Si degdeg ah ugu maamul POS-ka' : 'Fast-track your retail workflow'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Shortcuts list */}
        <div className="p-5 space-y-2.5">
          {shortcuts.map((s) => (
            <div
              key={s.key}
              className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800"
            >
              <span className="text-xs text-slate-700 dark:text-slate-300 font-medium">
                {language === 'so' ? s.descSo : s.descEn}
              </span>
              <kbd className="px-2.5 py-1 text-xs font-mono font-bold bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded shadow-xs text-emerald-600 dark:text-emerald-400">
                {s.key}
              </kbd>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-slate-50 dark:bg-slate-800/40 border-t border-slate-100 dark:border-slate-800 text-center">
          <span className="text-[11px] text-slate-400 flex items-center justify-center gap-1">
            <Command className="w-3 h-3" /> Safi Sali Companies High-Speed Engine
          </span>
        </div>
      </div>
    </div>
  );
};
