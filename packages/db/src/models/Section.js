import mongoose from 'mongoose';
import { tenantPlugin } from '../tenant-plugin.js';

const schema = new mongoose.Schema({
  campusId: { type: mongoose.Schema.Types.ObjectId, ref: 'Campus' },
  academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
  gradeLevelId: { type: mongoose.Schema.Types.ObjectId, ref: 'GradeLevel', required: true },
  name: { type: String, required: true, trim: true },
  status: { type: String, enum: ['DRAFT', 'ACTIVE', 'ARCHIVED'], default: 'ACTIVE' },
}, { timestamps: true });

schema.plugin(tenantPlugin);
schema.index({ institutionId: 1, academicYearId: 1, gradeLevelId: 1, name: 1 }, { unique: true });
schema.index({ institutionId: 1, academicYearId: 1, status: 1 });

export const Section = mongoose.models.Section || mongoose.model('Section', schema);
