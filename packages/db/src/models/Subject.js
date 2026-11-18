import mongoose from 'mongoose';
import { tenantPlugin } from '../tenant-plugin.js';

const schema = new mongoose.Schema({
  code: { type: String, required: true, trim: true, uppercase: true },
  name: { type: String, required: true, trim: true },
  status: { type: String, enum: ['ACTIVE', 'ARCHIVED'], default: 'ACTIVE' },
}, { timestamps: true });

schema.plugin(tenantPlugin);
schema.index({ institutionId: 1, code: 1 }, { unique: true });

export const Subject = mongoose.models.Subject || mongoose.model('Subject', schema);
