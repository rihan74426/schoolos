import mongoose from "mongoose";
import { tenantPlugin } from "../tenant-plugin.js";

const schema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    timezone: String,
    status: { type: String, enum: ["ACTIVE", "ARCHIVED"], default: "ACTIVE" },
  },
  { timestamps: true },
);

schema.plugin(tenantPlugin);
schema.index({ institutionId: 1, name: 1 }, { unique: true });

export const Campus =
  mongoose.models.Campus || mongoose.model("Campus", schema);
