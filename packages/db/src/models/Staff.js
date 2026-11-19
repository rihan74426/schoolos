import mongoose from 'mongoose';
import { tenantPlugin } from '../tenant-plugin.js';

// Staff profile for a Membership (teacher, coordinator, accounts…). One per membership.
const schema = new mongoose.Schema({
  membershipId: { type: mongoose.Schema.Types.ObjectId, ref: 'Membership', required: true },
  fullName: { type: String, required: true, trim: true },
  phone: { type: String, required: true, trim: true }, // normalized +8801XXXXXXXXX
  designation: { type: String, trim: true },
  subjects: { type: String, trim: true },
  profileCompletedAt: Date,
}, { timestamps: true });

schema.plugin(tenantPlugin);
schema.index({ institutionId: 1, membershipId: 1 }, { unique: true });

export const Staff = mongoose.models.Staff || mongoose.model('Staff', schema);
