import mongoose from 'mongoose';
import { tenantPlugin } from '../tenant-plugin.js';

// Which subjects a class (grade level) studies, with the usual full marks for exams.
const schema = new mongoose.Schema({
  gradeLevelId: { type: mongoose.Schema.Types.ObjectId, ref: 'GradeLevel', required: true },
  subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
  defaultMaxMarks: { type: Number, default: 100, min: 1, max: 1000 },
}, { timestamps: true });

schema.plugin(tenantPlugin);
schema.index({ institutionId: 1, gradeLevelId: 1, subjectId: 1 }, { unique: true });

export const ClassSubject = mongoose.models.ClassSubject || mongoose.model('ClassSubject', schema);
