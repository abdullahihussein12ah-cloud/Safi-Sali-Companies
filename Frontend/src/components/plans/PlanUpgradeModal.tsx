import React from 'react';
import { ArrowRight, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';

interface PlanUpgradeModalProps {
  onClose: () => void;
  title?: string;
  description?: string;
  returnToEmployeeCreation?: boolean;
  recommendedPlanId?: string;
}

const planSummaries = [
  { id: 'plan-basic', price: '$3 / month', key: 'planBasicLimits' },
  { id: 'plan-professional', price: '$5 / month', key: 'planProfessionalLimits' },
  { id: 'plan-enterprise', price: '$30 / month', key: 'planEnterpriseLimits' },
  { id: 'plan-annual', price: '$360 / year', key: 'planAnnualLimits' },
  { id: 'plan-lifetime', price: '$7,000 one-time', key: 'planLifetimeLimits' },
];

export const PlanUpgradeModal: React.FC<PlanUpgradeModalProps> = ({
  onClose,
  title,
  description,
  returnToEmployeeCreation = false,
  recommendedPlanId,
}) => {
  const { t, setActiveTab, setPendingPlanId, setPendingEmployeeCreation } = useApp();

  const openPlans = () => {
    if (returnToEmployeeCreation) setPendingEmployeeCreation(true);
    onClose();
    setActiveTab('choose_plan');
  };

  const openSelectedPlan = (planId: string) => {
    if (returnToEmployeeCreation) setPendingEmployeeCreation(true);
    onClose();
    setPendingPlanId(planId);
    setActiveTab('choose_plan');
  };
  const orderedPlans = recommendedPlanId
    ? [...planSummaries].sort((a, b) =>
        Number(b.id === recommendedPlanId) - Number(a.id === recommendedPlanId)
      )
    : planSummaries;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="plan-upgrade-title"
        className="max-h-[90dvh] w-full max-w-lg space-y-4 overflow-y-auto rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-800 dark:bg-slate-900 sm:p-6"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="plan-upgrade-title" className="text-lg font-black text-slate-900 dark:text-white">
              {title || t('planUpgradeTitle')}
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              {description || t('planUpgradeDescription')}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label={t('close')} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="h-5 w-5" />
          </button>
        </div>

        <ul className="space-y-2">
          {orderedPlans.map((plan) => (
            <li key={plan.id}>
              <button
                type="button"
                onClick={() => openSelectedPlan(plan.id)}
                className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2.5 text-left text-xs transition hover:border-emerald-400 hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:border-slate-800 dark:hover:bg-emerald-950/40"
                aria-label={`${t(plan.key)} — ${plan.price}`}
              >
                <span className="font-semibold text-slate-700 dark:text-slate-200">
                  {t(plan.key)}
                  {plan.id === recommendedPlanId && (
                    <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">
                      {t('recommendedUpgrade')}
                    </span>
                  )}
                </span>
                <span className="shrink-0 font-black text-emerald-700 dark:text-emerald-400">{plan.price}</span>
              </button>
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={openPlans}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-500"
        >
          {t('viewPlansAndPay')}
          <ArrowRight className="h-4 w-4" />
        </button>
      </section>
    </div>
  );
};
