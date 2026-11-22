import mongoose from 'mongoose';
import { tenantPlugin } from '../tenant-plugin.js';

const line = new mongoose.Schema({ title: String, amountMinor: Number }, { _id: false });
const adjustment = new mongoose.Schema({
  kind: { type: String, enum: ['DISCOUNT', 'LATE_FEE_REMIT'], required: true },
  amountMinor: { type: Number, required: true, min: 1 },
  reason: { type: String, required: true, maxlength: 300 },
  byMembershipId: { type: mongoose.Schema.Types.ObjectId, ref: 'Membership' },
  at: { type: Date, default: Date.now },
}, { _id: false });

// One bill for one student for one period. Money is integer paisa. Late fee is computed from the
// school's policy until settlement, then frozen in lateFeeFrozenMinor.
const schema = new mongoose.Schema({
  invoiceNumber: { type: String, required: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  planId: { type: mongoose.Schema.Types.ObjectId, ref: 'FeePlan', required: true },
  period: { type: String, required: true, match: /^\d{4}-(0[1-9]|1[0-2])$/ },
  lines: { type: [line], validate: (v) => v.length > 0 },
  subtotalMinor: { type: Number, required: true, min: 1 },
  discountMinor: { type: Number, default: 0, min: 0 },
  lateRemitMinor: { type: Number, default: 0, min: 0 },
  paidMinor: { type: Number, default: 0, min: 0 },
  dueDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  status: { type: String, enum: ['OPEN', 'PAID', 'VOID'], default: 'OPEN' },
  settledOn: { type: String, match: /^\d{4}-\d{2}-\d{2}$/ },
  lateFeeFrozenMinor: { type: Number, min: 0 },
  adjustments: { type: [adjustment], default: [] },
  voidReason: { type: String, maxlength: 300 },
  voidedAt: Date,
  voidedByMembershipId: { type: mongoose.Schema.Types.ObjectId, ref: 'Membership' },
  createdByMembershipId: { type: mongoose.Schema.Types.ObjectId, ref: 'Membership' },
}, { timestamps: true });

schema.plugin(tenantPlugin);
schema.index({ institutionId: 1, studentId: 1, planId: 1, period: 1 }, { unique: true });
schema.index({ institutionId: 1, invoiceNumber: 1 }, { unique: true });
schema.index({ institutionId: 1, status: 1, dueDate: 1 });

export const Invoice = mongoose.models.Invoice || mongoose.model('Invoice', schema);
