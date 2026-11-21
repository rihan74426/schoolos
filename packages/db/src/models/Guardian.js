import mongoose from 'mongoose';
import { tenantPlugin } from '../tenant-plugin.js';

const guardianLinkSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  relationship: { type: String, required: true, trim: true },
  isPrimary: { type: Boolean, default: false },
  verifiedAt: Date,
}, { _id: false });

const schema = new mongoose.Schema({
  membershipId: { type: mongoose.Schema.Types.ObjectId, ref: 'Membership' }, // set when the guardian has a login
  fullName: { type: String, required: true, trim: true },
  phone: { type: String, trim: true },
  email: { type: String, trim: true, lowercase: true },
  // Opt-in is explicit: nothing is sent until a guardian's consent is recorded.
  consent: {
    sms: { type: Boolean, default: false },
    whatsapp: { type: Boolean, default: false },
    source: { type: String, enum: ['VERBAL', 'WRITTEN_FORM', 'SMS_REPLY', 'OTHER'] }, // how the guardian agreed
    recordedAt: Date,
    recordedByMembershipId: { type: mongoose.Schema.Types.ObjectId, ref: 'Membership' },
  },
  studentLinks: { type: [guardianLinkSchema], default: [] },
}, { timestamps: true });

schema.plugin(tenantPlugin);
schema.index({ institutionId: 1, fullName: 1 });
// One guardian per phone per school (siblings share it). Partial: guardians without a phone are allowed.
schema.index({ institutionId: 1, phone: 1 }, { unique: true, partialFilterExpression: { phone: { $type: 'string' } } });

export const Guardian = mongoose.models.Guardian || mongoose.model('Guardian', schema);
