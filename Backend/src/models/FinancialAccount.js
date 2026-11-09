import mongoose from 'mongoose';

const financialAccountSchema = new mongoose.Schema(
  {
    tenantId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    type: { type: String, enum: ['cash', 'bank'], required: true },
    bankName: { type: String, trim: true, maxlength: 120, default: '' },
    currency: { type: String, required: true, uppercase: true, trim: true, maxlength: 12 },
    openingBalance: { type: Number, required: true, min: 0 },
    createdBy: { type: String, required: true },
  },
  { timestamps: true }
);

financialAccountSchema.index({ tenantId: 1, createdAt: 1 });

export const FinancialAccountModel = mongoose.model('FinancialAccount', financialAccountSchema);
