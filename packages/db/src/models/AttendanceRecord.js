import mongoose from 'mongoose';
import { tenantPlugin } from '../tenant-plugin.js';

const attendanceRecordSchema = new mongoose.Schema(
  {
    studentId: { type: String, required: true },
    date: { type: Date, required: true },
    status: { type: String, enum: ['present', 'absent', 'late', 'excused'], required: true },
  },
  { timestamps: true }
);

attendanceRecordSchema.plugin(tenantPlugin);

export const AttendanceRecord = mongoose.model('AttendanceRecord', attendanceRecordSchema);
