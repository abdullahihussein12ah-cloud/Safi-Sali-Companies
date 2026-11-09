import mongoose from 'mongoose';

const financialTransactionSchema = new mongoose.Schema(
  {
    tenantId: { type: String, required: true, index: true },
    accountId: { type: mongoose.Schema.Types.ObjectId, ref: 'FinancialAccount', required: true },
    type: { type: String, enum: ['income', 'expense'], required: true },
    category: { type: String, required: true, trim: true, maxlength: 80 },
    description: { type: String, required: true, trim: true, maxlength: 200 },
    amount: { type: Number, required: true, min: 0.01 },
    currency: { type: String, required: true, uppercase: true, trim: true, maxlength: 12 },
    date: { type: String, required: true },
    reference: { type: String, trim: true, maxlength: 120, default: '' },
    reconciled: { type: Boolean, default: false },
    reconciledAt: { type: Date },
    reconciledBy: { type: String, default: '' },
    adjustmentOf: { type: mongoose.Schema.Types.ObjectId, ref: 'FinancialTransaction' },
    adjustmentReason: { type: String, trim: true, maxlength: 500, default: '' },
    createdBy: { type: String, required: true },
    createdByName: { type: String, required: true },
  },
  { timestamps: true }
);

financialTransactionSchema.index({ tenantId: 1, date: -1 });
financialTransactionSchema.index({ tenantId: 1, accountId: 1, date: -1 });

export const FinancialTransactionModel = mongoose.model('FinancialTransaction', financialTransactionSchema);
