import mongoose from 'mongoose';
import { tenantPlugin } from '../tenant-plugin.js';

const schema = new mongoose.Schema({
  studentNumber: { type: String, required: true, trim: true },
  firstName: { type: String, required: true, trim: true },
  lastName: { type: String, required: true, trim: true },
  dateOfBirth: Date,
  sectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Section' },
  status: { type: String, enum: ['ACTIVE', 'WITHDRAWN', 'ALUMNI', 'SUSPENDED'], default: 'ACTIVE' },
  enrolledAt: { type: Date, default: Date.now },
}, { timestamps: true });

schema.plugin(tenantPlugin);
schema.index({ institutionId: 1, studentNumber: 1 }, { unique: true });
schema.index({ institutionId: 1, sectionId: 1, status: 1 });
schema.index({ institutionId: 1, status: 1, lastName: 1, firstName: 1 });

export const Student = mongoose.models.Student || mongoose.model('Student', schema);
