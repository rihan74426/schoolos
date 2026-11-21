import mongoose from 'mongoose';
import { tenantPlugin } from '../tenant-plugin.js';

// A fee structure for one academic year, optionally for one class (grade level). Amounts are integer paisa.
const schema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 60 },
  academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
  gradeLevelId: { type: mongoose.Schema.Types.ObjectId, ref: 'GradeLevel' }, // empty = every class
  lines: {
    type: [new mongoose.Schema({ title: { type: String, required: true, trim: true }, amountMinor: { type: Number, required: true, min: 1 } }, { _id: false })],
    validate: (v) => v.length > 0,
  },
  status: { type: String, enum: ['ACTIVE', 'ARCHIVED'], default: 'ACTIVE' },
  createdByMembershipId: { type: mongoose.Schema.Types.ObjectId, ref: 'Membership' },
}, { timestamps: true });

schema.plugin(tenantPlugin);
schema.index({ institutionId: 1, academicYearId: 1, name: 1 }, { unique: true });

export const FeePlan = mongoose.models.FeePlan || mongoose.model('FeePlan', schema);
