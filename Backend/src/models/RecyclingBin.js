import mongoose from 'mongoose';

const recyclingBinEntrySchema = new mongoose.Schema(
  {
    tenantId: { type: String, required: true, index: true, immutable: true },
    sourceOwnerId: { type: String, required: true, immutable: true },
    sourceScope: { type: String, enum: ['user', 'tenant'], required: true, immutable: true },
    dataKey: { type: String, required: true, immutable: true },
    module: { type: String, required: true, immutable: true },
    recordId: { type: String, required: true, immutable: true },
    recordName: { type: String, default: '', immutable: true },
    deletedRecord: { type: mongoose.Schema.Types.Mixed, required: true },
    deletedBy: { type: String, required: true, immutable: true },
    deletedByName: { type: String, default: '', immutable: true },
    deletedAt: { type: Date, required: true, immutable: true },
    editedBy: { type: String, default: '' },
    editedByName: { type: String, default: '' },
    editedAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false }
);

recyclingBinEntrySchema.index({ tenantId: 1, deletedAt: -1 });
recyclingBinEntrySchema.index({ tenantId: 1, module: 1, deletedAt: -1 });
recyclingBinEntrySchema.index(
  { tenantId: 1, sourceOwnerId: 1, sourceScope: 1, dataKey: 1, recordId: 1 },
  { unique: true }
);

const recyclingBinAuditSchema = new mongoose.Schema(
  {
    tenantId: { type: String, required: true, index: true, immutable: true },
    entryId: { type: String, required: true, immutable: true },
    recordId: { type: String, required: true, immutable: true },
    module: { type: String, required: true, immutable: true },
    action: {
      type: String,
      enum: ['deleted', 'edited', 'restored', 'permanently_deleted'],
      required: true,
      immutable: true,
    },
    actorId: { type: String, required: true, immutable: true },
    actorName: { type: String, default: '', immutable: true },
    occurredAt: { type: Date, default: Date.now, immutable: true, index: true },
    details: { type: mongoose.Schema.Types.Mixed, default: {}, immutable: true },
  },
  { timestamps: false, versionKey: false }
);

recyclingBinAuditSchema.index({ tenantId: 1, occurredAt: -1 });

export const RecyclingBinEntryModel = mongoose.model('RecyclingBinEntry', recyclingBinEntrySchema);
export const RecyclingBinAuditModel = mongoose.model('RecyclingBinAudit', recyclingBinAuditSchema);
