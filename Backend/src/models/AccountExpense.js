import mongoose from 'mongoose';

const accountExpenseSchema = new mongoose.Schema(
  {
    tenantId: { type: String, required: true, index: true },
    description: { type: String, required: true, trim: true, maxlength: 200 },
    category: { type: String, required: true, trim: true, maxlength: 80 },
    amount: { type: Number, required: true, min: 0.01 },
    currency: { type: String, required: true, uppercase: true, trim: true, maxlength: 12 },
    date: { type: String, required: true },
    paymentMethod: {
      type: String,
      enum: ['cash', 'evc_plus', 'zaad', 'sahal'],
      required: true,
    },
    accountId: { type: mongoose.Schema.Types.ObjectId, ref: 'FinancialAccount' },
    reconciled: { type: Boolean, default: false },
    reconciledAt: { type: Date },
    reconciledBy: { type: String, default: '' },
    createdBy: { type: String, required: true },
    createdByName: { type: String, required: true },
  },
  { timestamps: true }
);

accountExpenseSchema.index({ tenantId: 1, date: -1 });

export const AccountExpenseModel = mongoose.model('AccountExpense', accountExpenseSchema);
