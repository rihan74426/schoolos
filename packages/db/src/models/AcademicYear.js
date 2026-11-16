import mongoose from 'mongoose';
import { tenantPlugin } from '../tenant-plugin.js';

const schema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  startsOn: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  endsOn: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  isCurrent: { type: Boolean, default: false },
  status: { type: String, enum: ['DRAFT', 'ACTIVE', 'ARCHIVED'], default: 'DRAFT' },
}, { timestamps: true });

schema.plugin(tenantPlugin);
schema.index({ institutionId: 1, name: 1 }, { unique: true });
schema.index({ institutionId: 1, isCurrent: 1 });

export const AcademicYear = mongoose.models.AcademicYear || mongoose.model('AcademicYear', schema);
