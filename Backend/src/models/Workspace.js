import mongoose from 'mongoose';

export const EMPTY_USER_WORKSPACE_DATA = {
  settings: {},
  products: [],
  customers: [],
  suppliers: [],
  categories: [],
  category_records: [],
  category_descriptions: {},
  category_images: {},
  brand_records: [],
  sales: [],
  purchases: [],
  customer_ledger: [],
  supplier_ledger: [],
  stock_movements: [],
  payroll: [],
  attendance: [],
  leave_records: [],
};

const workspaceSchema = new mongoose.Schema(
  {
    ownerId: { type: String, required: true },
    scope: { type: String, enum: ['shared', 'user', 'tenant'], required: true },
    data: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

workspaceSchema.index({ ownerId: 1, scope: 1 }, { unique: true });

export const WorkspaceModel = mongoose.model('Workspace', workspaceSchema);
