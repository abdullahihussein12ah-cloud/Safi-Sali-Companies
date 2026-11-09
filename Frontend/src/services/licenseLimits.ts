export interface PlanLimits {
  users: number;
  products: number;
}

export const TRIAL_DURATION_DAYS = 365;

const UNLIMITED = Number.POSITIVE_INFINITY;

const PLAN_LIMITS: Record<string, PlanLimits> = {
  'plan-trial': { users: 3, products: 500 },
  'plan-basic': { users: 3, products: 500 },
  'plan-professional': { users: 10, products: UNLIMITED },
  'plan-pro': { users: 10, products: UNLIMITED },
  'plan-enterprise': { users: UNLIMITED, products: UNLIMITED },
  'plan-annual': { users: UNLIMITED, products: UNLIMITED },
  'plan-lifetime': { users: UNLIMITED, products: UNLIMITED },
};

export const getPlanLimits = (
  planId: string,
  overrides?: { users?: number | null; products?: number | null }
): PlanLimits => {
  if (overrides && (typeof overrides.users !== 'undefined' || typeof overrides.products !== 'undefined')) {
    const defaults = PLAN_LIMITS[planId] || PLAN_LIMITS['plan-trial'];
    return {
      users: typeof overrides.users === 'undefined'
        ? defaults.users
        : overrides.users === null ? UNLIMITED : overrides.users,
      products: typeof overrides.products === 'undefined'
        ? defaults.products
        : overrides.products === null ? UNLIMITED : overrides.products,
    };
  }
  return PLAN_LIMITS[planId] || PLAN_LIMITS['plan-trial'];
};

export const getRecommendedUpgradePlan = (planId: string): string | undefined => {
  switch (planId) {
    case 'plan-trial':
      return 'plan-basic';
    case 'plan-basic':
      return 'plan-professional';
    case 'plan-professional':
    case 'plan-pro':
      return 'plan-enterprise';
    case 'plan-enterprise':
      return 'plan-annual';
    case 'plan-annual':
      return 'plan-lifetime';
    default:
      return undefined;
  }
};
