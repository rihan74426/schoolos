import mongoose from 'mongoose';
import { tenantPlugin } from '../tenant-plugin.js';

// One subject paper for one section inside an exam.
const schema = new mongoose.Schema({
  examId: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam', required: true },
  sectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Section', required: true },
  subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
  maxMarks: { type: Number, required: true, min: 1, max: 1000 },
  date: { type: String, match: /^\d{4}-\d{2}-\d{2}$/ },
}, { timestamps: true });

schema.plugin(tenantPlugin);
schema.index({ institutionId: 1, examId: 1, sectionId: 1, subjectId: 1 }, { unique: true });

export const Assessment = mongoose.models.Assessment || mongoose.model('Assessment', schema);
