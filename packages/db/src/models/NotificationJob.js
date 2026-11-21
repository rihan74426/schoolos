import mongoose from 'mongoose';
import { tenantPlugin } from '../tenant-plugin.js';

// One outbound message to one recipient. Created by the app (e.g. after attendance is submitted),
// sent by a worker, so provider failures never block the action that triggered them.
const schema = new mongoose.Schema({
  kind: { type: String, enum: ['ABSENCE_ALERT'], required: true },
  channel: { type: String, enum: ['SMS'], default: 'SMS' },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student' },
  guardianId: { type: mongoose.Schema.Types.ObjectId, ref: 'Guardian' },
  to: { type: String, required: true },
  text: { type: String, required: true, maxlength: 1000 },
  segments: { type: Number, default: 1 },
  // Same key = same message: re-submitting or correcting attendance never re-sends.
  idempotencyKey: { type: String, required: true },
  status: { type: String, enum: ['QUEUED', 'SENDING', 'SENT', 'DELIVERED', 'FAILED'], default: 'QUEUED' },
  attempts: { type: Number, default: 0 },
  nextAttemptAt: { type: Date, default: Date.now },
  lockedAt: Date,
  providerId: String,
  lastError: { type: String, maxlength: 300 },
  sentAt: Date,
  deliveredAt: Date,
  lastPolledAt: Date,
}, { timestamps: true });

schema.plugin(tenantPlugin);
schema.index({ institutionId: 1, idempotencyKey: 1 }, { unique: true });
schema.index({ institutionId: 1, status: 1, nextAttemptAt: 1 });
schema.index({ institutionId: 1, createdAt: -1 });

export const NotificationJob = mongoose.models.NotificationJob || mongoose.model('NotificationJob', schema);
