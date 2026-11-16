import mongoose from 'mongoose';
import { tenantPlugin } from '../tenant-plugin.js';

const schema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  slug: { type: String, required: true, trim: true, lowercase: true },
  defaultLocale: { type: String, enum: ['en', 'bn', 'ar'], default: 'en' },
  timezone: { type: String, default: 'Asia/Dhaka' },
}, { timestamps: true });

schema.index({ slug:  1 }, { unique: true });

export const Institution = mongoose.models.Institution || mongoose.model('Institution', schema);
