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
  studentLinks: { type: [guardianLinkSchema], default: [] },
}, { timestamps: true });

schema.plugin(tenantPlugin);
schema.index({ institutionId: 1, fullName: 1 });
schema.index({ institutionId: 1, phone: 1 });

export const Guardian = mongoose.models.Guardian || mongoose.model('Guardian', schema);
