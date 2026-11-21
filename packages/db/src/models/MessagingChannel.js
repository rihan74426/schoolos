import mongoose from 'mongoose';
import { tenantPlugin } from '../tenant-plugin.js';

// One channel per kind per school. Credentials are encrypted by the web service and
// excluded from every default query (select: false); load them with .select('+credentialsEnc').
const schema = new mongoose.Schema({
  kind: { type: String, enum: ['SMS', 'WHATSAPP'], required: true },
  provider: { type: String, enum: ['FAKE', 'SMS_NET_BD'], required: true },
  senderId: { type: String, trim: true, default: '' },
  credentialsEnc: { type: String, select: false },
  keyHint: { type: String, default: '' }, // last 4 chars of the key, for display only
  active: { type: Boolean, default: true },
  lastTest: { at: Date, ok: Boolean, detail: { type: String, maxlength: 300 } },
  updatedByMembershipId: { type: mongoose.Schema.Types.ObjectId, ref: 'Membership' },
}, { timestamps: true });

schema.plugin(tenantPlugin);
schema.index({ institutionId: 1, kind: 1 }, { unique: true });

export const MessagingChannel = mongoose.models.MessagingChannel || mongoose.model('MessagingChannel', schema);
