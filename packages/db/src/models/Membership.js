import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  institutionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Institution', required: true },
  clerkUserId: { type: String, required: true, index: true },
  role: { type: String, required: true, enum: ['OWNER', 'ADMIN', 'PRINCIPAL', 'ACADEMIC_COORDINATOR', 'TEACHER', 'ACCOUNTS', 'GUARDIAN', 'STUDENT'] },
  active: { type: Boolean, default: true },
}, { timestamps: true });

schema.index({ institutionId: 1, clerkUserId: 1 }, { unique: true });
schema.index({ clerkUserId: 1, active: 1 });

export const Membership = mongoose.models.Membership || mongoose.model('Membership', schema);
