import mongoose from 'mongoose';
import { tenantPlugin } from '../tenant-plugin.js';

const override = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  reason: { type: String, required: true, maxlength: 300 },
  byMembershipId: { type: mongoose.Schema.Types.ObjectId, ref: 'Membership' },
  at: { type: Date, default: Date.now },
}, { _id: false });

// One exam for one class in one academic year. Status flow: DRAFT -> ENTRY -> SUBMITTED -> APPROVED -> PUBLISHED.
// passRule is the exam controller's choice; passOverrides lets them pass a named student with a reason.
const schema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 60 },
  term: { type: String, trim: true, maxlength: 40, default: '' },
  academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
  gradeLevelId: { type: mongoose.Schema.Types.ObjectId, ref: 'GradeLevel', required: true },
  status: { type: String, enum: ['DRAFT', 'ENTRY', 'SUBMITTED', 'APPROVED', 'PUBLISHED'], default: 'DRAFT' },
  passRule: { type: String, enum: ['ALL_SUBJECTS', 'CORE_ONLY'], default: 'ALL_SUBJECTS' },
  passOverrides: { type: [override], default: [] },
  resultVersion: { type: Number, default: 0 }, // latest ResultSnapshot version; 0 until published
  publishedAt: Date,
  publishedByMembershipId: { type: mongoose.Schema.Types.ObjectId, ref: 'Membership' },
  createdByMembershipId: { type: mongoose.Schema.Types.ObjectId, ref: 'Membership' },
}, { timestamps: true });

schema.plugin(tenantPlugin);
schema.index({ institutionId: 1, academicYearId: 1, gradeLevelId: 1, name: 1 }, { unique: true });
schema.index({ institutionId: 1, status: 1 });

export const Exam = mongoose.models.Exam || mongoose.model('Exam', schema);
