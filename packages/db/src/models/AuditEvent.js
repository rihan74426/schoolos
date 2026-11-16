import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  institutionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Institution', required: true, index: true },
  actorMembershipId: { type: mongoose.Schema.Types.ObjectId, ref: 'Membership' },
  action: { type: String, required: true },
  entityType: { type: String, required: true },
  entityId: { type: String, required: true },
  metadata: { type: mongoose.Schema.Types.Mixed },
}, { timestamps: { createdAt: true, updatedAt: false } });

schema.index({ institutionId: 1, createdAt: -1 });
schema.index({ institutionId: 1, entityType: 1, entityId: 1 });

export const AuditEvent = mongoose.models.AuditEvent || mongoose.model('AuditEvent', schema);
