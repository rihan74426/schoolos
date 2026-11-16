import mongoose from 'mongoose';
import { tenantPlugin } from '../tenant-plugin.js';

const entrySchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  status: { type: String, enum: ['PRESENT', 'LATE', 'ABSENT', 'EXCUSED'], required: true },
  note: { type: String, maxlength: 500 },
}, { _id: false });

const schema = new mongoose.Schema({
  sectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Section', required: true },
  date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  status: { type: String, enum: ['DRAFT', 'ACTIVE', 'ARCHIVED'], default: 'DRAFT' },
  recordedByMembershipId: { type: mongoose.Schema.Types.ObjectId, ref: 'Membership', required: true },
  submittedAt: Date,
  entries: { type: [entrySchema], default: [], validate: (value) => value.length <= 500 },
}, { timestamps: true });

schema.plugin(tenantPlugin);
schema.index({ institutionId: 1, sectionId: 1, date: 1 }, { unique: true });
schema.index({ institutionId: 1, date: 1, status: 1 });

export const AttendanceSession = mongoose.models.AttendanceSession || mongoose.model('AttendanceSession', schema);
