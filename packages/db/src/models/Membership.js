import mongoose from "mongoose";
import { tenantPlugin } from "../tenant-plugin.js";

const schema = new mongoose.Schema(
  {
    clerkUserId: { type: String, required: true, index: true },
    role: {
      type: String,
      required: true,
      enum: [
        "OWNER",
        "ADMIN",
        "PRINCIPAL",
        "VICE_PRINCIPAL",
        "ACADEMIC_COORDINATOR",
        "TEACHER",
        "ACCOUNTS",
        "GUARDIAN",
        "STUDENT",
      ],
    },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

schema.plugin(tenantPlugin, { allowClerkUserLookup: true });
schema.index({ institutionId: 1, clerkUserId: 1 }, { unique: true });
schema.index({ clerkUserId: 1, active: 1 });

export const Membership =
  mongoose.models.Membership || mongoose.model("Membership", schema);
