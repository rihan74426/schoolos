import mongoose from 'mongoose';
import { tenantPlugin } from '../tenant-plugin.js';

// Money received against an invoice. Append-only: a mistake is fixed by a REVERSAL row (negative amount,
// reason, unique per original payment), never by editing or deleting the original.
const schema = new mongoose.Schema({
  invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice', required: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  kind: { type: String, enum: ['PAYMENT', 'REVERSAL'], default: 'PAYMENT' },
  amountMinor: { type: Number, required: true, validate: (v) => Number.isInteger(v) && v !== 0 },
  reversesPaymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment' },
  reason: { type: String, trim: true, maxlength: 300 },
  // Derived dedupe key (METHOD:REFERENCE) for non-cash payments; cleared when the payment is reversed.
  refKey: { type: String },
  method: { type: String, enum: ['CASH', 'BANK', 'BKASH', 'NAGAD', 'OTHER'], required: true },
  reference: { type: String, trim: true, maxlength: 60, default: '' },
  paidOn: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  receiptNumber: { type: String, required: true },
  receivedByMembershipId: { type: mongoose.Schema.Types.ObjectId, ref: 'Membership' },
}, { timestamps: true });

schema.plugin(tenantPlugin);
schema.index({ institutionId: 1, receiptNumber: 1 }, { unique: true });
schema.index({ institutionId: 1, invoiceId: 1 });
schema.index({ institutionId: 1, refKey: 1 }, { unique: true, partialFilterExpression: { refKey: { $type: 'string' } } });
schema.index({ institutionId: 1, reversesPaymentId: 1 }, { unique: true, partialFilterExpression: { reversesPaymentId: { $type: 'objectId' } } });

export const Payment = mongoose.models.Payment || mongoose.model('Payment', schema);
