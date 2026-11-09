import mongoose from 'mongoose';
import { setLicenseLimits, TRIAL_DURATION_DAYS } from '../licenseLimits.js';

export const DEFAULT_SUBSCRIPTION_PLANS = [
  { planId: 'plan-trial', name: '365-Day Free Trial', priceUSD: 0, durationDays: TRIAL_DURATION_DAYS, userLimit: 3, productLimit: 500, billingPeriod: 'trial' },
  { planId: 'plan-basic', name: 'Basic Retail Plan', priceUSD: 3, durationDays: 30, userLimit: 3, productLimit: 500, billingPeriod: 'monthly' },
  { planId: 'plan-professional', name: 'Professional Business Plan', priceUSD: 5, durationDays: 30, userLimit: 10, productLimit: null, billingPeriod: 'monthly' },
  { planId: 'plan-enterprise', name: 'Enterprise Wholesaler Plan', priceUSD: 30, durationDays: 30, userLimit: null, productLimit: null, billingPeriod: 'monthly' },
  { planId: 'plan-annual', name: 'Annual Enterprise Plan', priceUSD: 360, durationDays: 365, userLimit: null, productLimit: null, billingPeriod: 'yearly' },
  { planId: 'plan-lifetime', name: 'Lifetime Enterprise Plan', priceUSD: 7000, durationDays: 0, userLimit: null, productLimit: null, billingPeriod: 'lifetime' },
];

const subscriptionPlanSchema = new mongoose.Schema(
  {
    planId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    priceUSD: { type: Number, required: true, min: 0 },
    durationDays: { type: Number, required: true, min: 0 },
    userLimit: { type: Number, default: null, min: 1 },
    productLimit: { type: Number, default: null, min: 1 },
    billingPeriod: { type: String, enum: ['trial', 'monthly', 'yearly', 'lifetime'], required: true },
    enabled: { type: Boolean, default: true },
  },
  { timestamps: true }
);

subscriptionPlanSchema.index({ enabled: 1, planId: 1 });

export const SubscriptionPlanModel = mongoose.model('SubscriptionPlan', subscriptionPlanSchema);

export async function ensureSubscriptionPlans() {
  const planIds = DEFAULT_SUBSCRIPTION_PLANS.map((plan) => plan.planId);
  await SubscriptionPlanModel.collection.updateMany(
    {
      $or: [
        { planId: { $exists: false }, id: { $in: planIds } },
        { id: { $exists: false }, planId: { $in: planIds } },
      ],
    },
    [{
      $set: {
        planId: { $ifNull: ['$planId', '$id'] },
        id: { $ifNull: ['$id', '$planId'] },
      },
    }]
  );
  await SubscriptionPlanModel.bulkWrite(
    DEFAULT_SUBSCRIPTION_PLANS.map((plan) => ({
      updateOne: {
        filter: { planId: plan.planId },
        update: { $setOnInsert: plan },
        upsert: true,
      },
    }))
  );
  await SubscriptionPlanModel.updateOne(
    { planId: 'plan-trial' },
    { $set: { name: '365-Day Free Trial', durationDays: TRIAL_DURATION_DAYS } }
  );
  const plans = await SubscriptionPlanModel.find().lean();
  plans.forEach((plan) => {
    setLicenseLimits(plan.planId, {
      users: Number.isSafeInteger(plan.userLimit) ? plan.userLimit : Number.POSITIVE_INFINITY,
      products: Number.isSafeInteger(plan.productLimit) ? plan.productLimit : Number.POSITIVE_INFINITY,
    });
  });
}