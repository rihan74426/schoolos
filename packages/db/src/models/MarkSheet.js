import mongoose from 'mongoose';
import { tenantPlugin } from '../tenant-plugin.js';

const entry = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  status: { type: String, enum: ['PRESENT', 'ABSENT', 'EXEMPT'], required: true },
  marks: { type: Number, min: 0 },
}, { _id: false });

// Marks for one assessment, one row per student, embedded like AttendanceSession. Unique per assessment.
// Editable only while status is ENTRY (after a return or before submit). Published results live in ResultSnapshot.
const schema = new mongoose.Schema({
  examId: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam', required: true },
  assessmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Assessment', required: true },
  sectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Section', required: true },
  subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
  status: { type: String, enum: ['ENTRY', 'SUBMITTED', 'APPROVED'], default: 'ENTRY' },
  entries: { type: [entry], default: [] },
  returnReason: { type: String, maxlength: 300 },
  submittedByMembershipId: { type: mongoose.Schema.Types.ObjectId, ref: 'Membership' },
  submittedAt: Date,
  approvedByMembershipId: { type: mongoose.Schema.Types.ObjectId, ref: 'Membership' },
  approvedAt: Date,
}, { timestamps: true });

schema.plugin(tenantPlugin);
schema.index({ institutionId: 1, assessmentId: 1 }, { unique: true });
schema.index({ institutionId: 1, examId: 1, status: 1 });
schema.index({ institutionId: 1, status: 1, submittedAt: 1 });

export const MarkSheet = mongoose.models.MarkSheet || mongoose.model('MarkSheet', schema);
