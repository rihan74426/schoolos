import mongoose from 'mongoose';
import { tenantPlugin } from '../tenant-plugin.js';

const bandSchema = new mongoose.Schema({
  label: { type: String, required: true, trim: true },
  minPercent: { type: Number, required: true, min: 0, max: 100 },
  gradePoint: Number,
  remark: String,
}, { _id: false });

const schema = new mongoose.Schema({
  key: { type: String, required: true, trim: true },
  name: { type: String, required: true, trim: true },
  kind: { type: String, enum: ['LETTER', 'GPA', 'DIVISION', 'PASS_FAIL', 'CUSTOM'], default: 'CUSTOM' },
  passPercent: { type: Number, required: true, min: 0, max: 100 },
  failLabel: { type: String, default: 'F' },
  bands: { type: [bandSchema], validate: (v) => v.length > 0 },
  sourcePreset: String,
  isDefault: { type: Boolean, default: false },
  status: { type: String, enum: ['ACTIVE', 'ARCHIVED'], default: 'ACTIVE' },
}, { timestamps: true });

schema.plugin(tenantPlugin);
schema.index({ institutionId: 1, key: 1 }, { unique: true });
// Key includes isDefault so it never collides with the plugin's { institutionId: 1 } index.
schema.index({ institutionId: 1, isDefault: 1 }, { unique: true, partialFilterExpression: { isDefault: true } });

export const GradingScheme = mongoose.models.GradingScheme || mongoose.model('GradingScheme', schema);
