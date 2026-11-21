import mongoose from 'mongoose';
import { tenantPlugin } from '../tenant-plugin.js';

// Money received against an invoice. Never edited or deleted; corrections are a separate, audited step.
const schema = new mongoose.Schema({
  invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice', required: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  amountMinor: { type: Number, required: true, min: 1 },
  method: { type: String, enum: ['CASH', 'BANK', 'BKASH', 'NAGAD', 'OTHER'], required: true },
  reference: { type: String, trim: true, maxlength: 60, default: '' },
  paidOn: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  receiptNumber: { type: String, required: true },
  receivedByMembershipId: { type: mongoose.Schema.Types.ObjectId, ref: 'Membership' },
}, { timestamps: true });

schema.plugin(tenantPlugin);
schema.index({ institutionId: 1, receiptNumber: 1 }, { unique: true });
schema.index({ institutionId: 1, invoiceId: 1 });

export const Payment = mongoose.models.Payment || mongoose.model('Payment', schema);
