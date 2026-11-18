import mongoose from 'mongoose';
import { tenantPlugin } from '../tenant-plugin.js';

// One document per institution. Shape is validated by institutionPolicySchema in @schoolos/core
// before every write; `version` increments on each change and each change is audited.
const schema = new mongoose.Schema({
  version: { type: Number, default: 1 },
  sourcePreset: String,
  policy: { type: mongoose.Schema.Types.Mixed, required: true },
  updatedByMembershipId: { type: mongoose.Schema.Types.ObjectId, ref: 'Membership' },
}, { timestamps: true });

schema.plugin(tenantPlugin);
// One policy per institution: make the plugin's institutionId index unique (a second index on the same key conflicts).
schema.path('institutionId').index({ unique: true });

export const InstitutionPolicy = mongoose.models.InstitutionPolicy || mongoose.model('InstitutionPolicy', schema);
