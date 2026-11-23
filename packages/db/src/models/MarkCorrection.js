import mongoose from 'mongoose';
import { tenantPlugin } from '../tenant-plugin.js';

const value = new mongoose.Schema({ status: String, marks: Number }, { _id: false });

// A change to one student's mark after the exam is published. Needs a reason and an approval; approval
// updates the sheet and writes a new ResultSnapshot version. Before/after are kept here and in AuditEvent.
const schema = new mongoose.Schema({
  examId: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam', required: true },
  assessmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Assessment', required: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  before: { type: value, required: true },
  after: { type: value, required: true },
  reason: { type: String, required: true, maxlength: 300 },
  status: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], default: 'PENDING' },
  requestedByMembershipId: { type: mongoose.Schema.Types.ObjectId, ref: 'Membership' },
  decidedByMembershipId: { type: mongoose.Schema.Types.ObjectId, ref: 'Membership' },
  decisionNote: { type: String, maxlength: 300 },
  decidedAt: Date,
  resultVersion: Number, // snapshot version written on approval
}, { timestamps: true });

schema.plugin(tenantPlugin);
schema.index({ institutionId: 1, examId: 1, status: 1 });
// One open correction per student and assessment at a time.
schema.index({ institutionId: 1, assessmentId: 1, studentId: 1 }, { unique: true, partialFilterExpression: { status: 'PENDING' } });

export const MarkCorrection = mongoose.models.MarkCorrection || mongoose.model('MarkCorrection', schema);
