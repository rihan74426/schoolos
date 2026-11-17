import mongoose from "mongoose";
import { tenantPlugin } from "../tenant-plugin.js";

const schema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
      index: true,
    },
    sectionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Section",
      required: true,
      index: true,
    },
    academicYearId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AcademicYear",
      required: true,
    },
    startsOn: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    endsOn: { type: String, match: /^\d{4}-\d{2}-\d{2}$/ },
    status: {
      type: String,
      enum: ["ACTIVE", "COMPLETED", "WITHDRAWN"],
      default: "ACTIVE",
    },
  },
  { timestamps: true },
);

schema.plugin(tenantPlugin);
schema.index(
  { institutionId: 1, studentId: 1, academicYearId: 1 },
  { unique: true },
);
schema.index({ institutionId: 1, sectionId: 1, startsOn: 1 });

export const Enrollment =
  mongoose.models.Enrollment || mongoose.model("Enrollment", schema);
