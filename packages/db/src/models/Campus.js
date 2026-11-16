import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  timezone: String,
  status: { type: String, enum: ['ACTIVE', 'ARCHIVED'], default: 'ACTIVE' },
  institutionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Institution', required: true, index: true },
}, { timestamps: true });

schema.index({ institutionId: 1, name: 1 }, { unique: true });

export const Campus = mongoose.models.Campus || mongoose.model('Campus', schema);
