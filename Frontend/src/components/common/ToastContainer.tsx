import React from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useApp();

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-50 flex w-auto max-w-sm flex-col gap-2 sm:inset-x-auto sm:bottom-4 sm:right-4 sm:w-full">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto flex items-center justify-between p-3.5 rounded-xl shadow-lg border backdrop-blur-md transition-all ${
            toast.type === 'success'
              ? 'bg-emerald-950/95 text-white border-emerald-600/60 shadow-emerald-900/20'
              : toast.type === 'error'
              ? 'bg-rose-950/95 text-white border-rose-600/60 shadow-rose-900/20'
              : 'bg-slate-900/95 text-white border-slate-700 shadow-slate-900/20'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {toast.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />}
            {toast.type === 'error' && <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />}
            {toast.type === 'info' && <Info className="w-5 h-5 text-blue-400 shrink-0" />}
            <span className="text-xs font-medium leading-snug">{toast.message}</span>
          </div>
          <button
            onClick={() => removeToast(toast.id)}
            className="ml-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-white/70 hover:bg-white/10 hover:text-white"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
};
