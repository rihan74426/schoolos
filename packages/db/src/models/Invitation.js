import mongoose from 'mongoose';
import { tenantPlugin } from '../tenant-plugin.js';

// Single-use, expiring join link. Only the SHA-256 hash of the token is stored;
// the raw token exists once, in the link shown to the inviter.
const schema = new mongoose.Schema({
  tokenHash: { type: String, required: true, match: /^[a-f0-9]{64}$/ },
  role: {
    type: String, required: true,
    enum: ['ADMIN', 'PRINCIPAL', 'ACADEMIC_COORDINATOR', 'TEACHER', 'ACCOUNTS'],
  },
  inviteeNote: { type: String, trim: true, maxlength: 80 },
  status: { type: String, enum: ['PENDING', 'ACCEPTED', 'REVOKED'], default: 'PENDING' },
  expiresAt: { type: Date, required: true },
  createdByMembershipId: { type: mongoose.Schema.Types.ObjectId, ref: 'Membership', required: true },
  acceptedByClerkUserId: String,
  acceptedAt: Date,
}, { timestamps: true });

schema.plugin(tenantPlugin, { allowTokenHashLookup: true });
schema.index({ tokenHash: 1 }, { unique: true });
schema.index({ institutionId: 1, status: 1, expiresAt: 1 });

export const Invitation = mongoose.models.Invitation || mongoose.model('Invitation', schema);
