import mongoose from 'mongoose';

const licensePaymentRequestSchema = new mongoose.Schema(
  {
    requestId: { type: String, required: true, unique: true, immutable: true },
    tenantId: { type: String, required: true, index: true, immutable: true },
    requestedBy: { type: String, required: true, immutable: true },
    requestedByName: { type: String, default: '', immutable: true },
    planId: { type: String, required: true, immutable: true },
    planName: { type: String, required: true, immutable: true },
    priceUSD: { type: Number, required: true, min: 0, immutable: true },
    durationDays: { type: Number, required: true, min: 0, immutable: true },
    trxId: { type: String, required: true, unique: true, immutable: true },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
    submittedAt: { type: Date, required: true, immutable: true },
    approvedAt: { type: Date, default: null },
    approvedBy: { type: String, default: '' },
    rejectedAt: { type: Date, default: null },
    rejectedBy: { type: String, default: '' },
  },
  { timestamps: false, versionKey: false }
);

licensePaymentRequestSchema.index({ tenantId: 1, submittedAt: -1 });
licensePaymentRequestSchema.index({ status: 1, submittedAt: -1 });

export const LicensePaymentRequestModel = mongoose.model(
  'LicensePaymentRequest',
  licensePaymentRequestSchema
);