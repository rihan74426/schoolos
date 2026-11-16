import mongoose from 'mongoose';
import { tenantPlugin } from '../tenant-plugin.js';

const schema = new mongoose.Schema({
  name: { type: String, required: true },
  startsOn: { type: Date, required: true },
  endsOn: { type: Date, required: true },
}, { timestamps: true });

schema.plugin(tenantPlugin);
schema.index({ institutionId: 1, name: 1 }, { unique: true });

export const AcademicTerm = mongoose.models.AcademicTerm || mongoose.model('AcademicTerm', schema);
