import mongoose from 'mongoose';
import { tenantPlugin } from './tenant-plugin.js';

const studentSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true },
    studentId: { type: String, required: true, unique: true },
    section: { type: String, required: true },
    status: { type: String, enum: ['active', 'alumni', 'suspended'], default: 'active' },
  },
  { timestamps: true }
);

studentSchema.plugin(tenantPlugin);

export const Student = mongoose.model('Student', studentSchema);
