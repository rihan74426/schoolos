import mongoose from 'mongoose';
import { tenantPlugin } from '../tenant-plugin.js';

// Per-school gap-tolerant sequences (invoice and receipt numbers).
const schema = new mongoose.Schema({
  key: { type: String, required: true },
  seq: { type: Number, default: 0 },
});

schema.plugin(tenantPlugin);
schema.index({ institutionId: 1, key: 1 }, { unique: true });

export const Counter = mongoose.models.Counter || mongoose.model('Counter', schema);
