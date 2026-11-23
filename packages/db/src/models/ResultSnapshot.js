import mongoose from 'mongoose';
import { tenantPlugin } from '../tenant-plugin.js';

// Written at publish (version 1) and again for each approved correction (version 2, 3 ...). Never updated.
// Stores the grading scheme used and every student's marks, grades and totals, so later scheme or marks
// edits cannot change what was published.
const schema = new mongoose.Schema({
  examId: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam', required: true },
  version: { type: Number, required: true, min: 1 },
  examName: String,
  term: String,
  passRule: String,
  scheme: { type: mongoose.Schema.Types.Mixed, required: true },
  results: { type: [mongoose.Schema.Types.Mixed], default: [] },
  correctionId: { type: mongoose.Schema.Types.ObjectId, ref: 'MarkCorrection' },
  publishedByMembershipId: { type: mongoose.Schema.Types.ObjectId, ref: 'Membership' },
  publishedAt: { type: Date, default: Date.now },
}, { timestamps: true });

schema.plugin(tenantPlugin);
schema.index({ institutionId: 1, examId: 1, version: 1 }, { unique: true });

export const ResultSnapshot = mongoose.models.ResultSnapshot || mongoose.model('ResultSnapshot', schema);
