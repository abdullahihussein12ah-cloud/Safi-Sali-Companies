const UNLIMITED = Number.POSITIVE_INFINITY;
export const TRIAL_DURATION_DAYS = 365;

const PLAN_LIMITS = new Map(Object.entries({
  'plan-trial': { users: 3, products: 500 },
  'plan-basic': { users: 3, products: 500 },
  'plan-professional': { users: 10, products: UNLIMITED },
  'plan-pro': { users: 10, products: UNLIMITED },
  'plan-enterprise': { users: UNLIMITED, products: UNLIMITED },
  'plan-annual': { users: UNLIMITED, products: UNLIMITED },
  'plan-lifetime': { users: UNLIMITED, products: UNLIMITED },
}));

export function getLicenseLimits(planId) {
  return PLAN_LIMITS.get(planId) || PLAN_LIMITS.get('plan-trial');
}

export function setLicenseLimits(planId, limits) {
  if (
    typeof planId !== 'string' ||
    !limits ||
    ![limits.users, limits.products].every((limit) =>
      limit === UNLIMITED || (Number.isSafeInteger(limit) && limit >= 1)
    )
  ) {
    throw new Error('Subscription limits are invalid.');
  }
  PLAN_LIMITS.set(planId, { users: limits.users, products: limits.products });
}
