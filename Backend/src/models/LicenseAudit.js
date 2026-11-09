import mongoose from 'mongoose';

const licenseAuditSchema = new mongoose.Schema(
  {
    tenantId: { type: String, required: true, index: true, immutable: true },
    actorId: { type: String, required: true, immutable: true },
    actorName: { type: String, default: '', immutable: true },
    action: { type: String, required: true, immutable: true },
    requestId: { type: String, default: '', immutable: true },
    occurredAt: { type: Date, default: Date.now, immutable: true, index: true },
    details: { type: mongoose.Schema.Types.Mixed, default: {}, immutable: true },
  },
  { timestamps: false, versionKey: false, strict: true }
);

licenseAuditSchema.index({ tenantId: 1, occurredAt: -1 });

export const LicenseAuditModel = mongoose.model('LicenseAudit', licenseAuditSchema);