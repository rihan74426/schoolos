import mongoose from 'mongoose';
import { tenantPlugin } from '../tenant-plugin.js';

const schema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  sortOrder: { type: Number, default: 0 },
  status: { type: String, enum: ['DRAFT', 'ACTIVE', 'ARCHIVED'], default: 'ACTIVE' },
}, { timestamps: true });

schema.plugin(tenantPlugin);
schema.index({ institutionId: 1, name: 1 }, { unique: true });
schema.index({ institutionId: 1, sortOrder: 1 });

export const GradeLevel = mongoose.models.GradeLevel || mongoose.model('GradeLevel', schema);
