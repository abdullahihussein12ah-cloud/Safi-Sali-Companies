import mongoose from 'mongoose';

const userActivitySchema = new mongoose.Schema(
  {
    action: {
      type: String,
      enum: ['registered', 'user_created', 'user_updated', 'user_deleted', 'user_restored', 'user_permanently_deleted'],
      required: true,
    },
    actorId: { type: String, required: true },
    actorName: { type: String, default: '' },
    targetUserId: { type: String, required: true },
    targetName: { type: String, required: true },
    targetEmail: { type: String, default: '' },
    targetRole: { type: String, default: '' },
    tenantId: { type: String, default: '' },
    occurredAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: false }
);

userActivitySchema.index({ tenantId: 1, occurredAt: -1 });
userActivitySchema.index({ targetUserId: 1, occurredAt: -1 });

export const UserActivityModel = mongoose.model('UserActivity', userActivitySchema);
