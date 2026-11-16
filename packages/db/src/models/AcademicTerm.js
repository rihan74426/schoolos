import mongoose from 'mongoose';
import { tenantPlugin } from '../tenant-plugin.js';

const academicTermSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
  },
  { timestamps: true }
);

academicTermSchema.plugin(tenantPlugin);

export const AcademicTerm = mongoose.model('AcademicTerm', academicTermSchema);
