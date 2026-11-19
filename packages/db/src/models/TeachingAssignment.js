import mongoose from 'mongoose';
import { tenantPlugin } from '../tenant-plugin.js';

// Links a staff Membership (usually role TEACHER) to a section (optionally a subject).
// A section-wide assignment (no subjectId) is the class-teacher / attendance owner.
const schema = new mongoose.Schema({
  membershipId: { type: mongoose.Schema.Types.ObjectId, ref: 'Membership', required: true },
  sectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Section', required: true },
  subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject' },
  academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
  status: { type: String, enum: ['ACTIVE', 'ENDED'], default: 'ACTIVE' },
}, { timestamps: true });

schema.plugin(tenantPlugin);
schema.index({ institutionId: 1, membershipId: 1, status: 1 });
schema.index({ institutionId: 1, sectionId: 1, status: 1 });
// At most one ACTIVE assignment per teacher and section (blocks double-click duplicates).
schema.index(
  { institutionId: 1, membershipId: 1, sectionId: 1 },
  { unique: true, partialFilterExpression: { status: 'ACTIVE' } },
);

export const TeachingAssignment = mongoose.models.TeachingAssignment || mongoose.model('TeachingAssignment', schema);
