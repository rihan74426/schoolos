import mongoose from "mongoose";

const schema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true, lowercase: true },
    bootstrapKey: { type: String, select: false },
    defaultLocale: { type: String, enum: ["en", "bn", "ar"], default: "en" },
    timezone: { type: String, default: "Asia/Dhaka" },
  },
  { timestamps: true },
);

schema.index({ slug: 1 }, { unique: true });
schema.index({ bootstrapKey: 1 }, { unique: true, sparse: true });

export const Institution =
  mongoose.models.Institution || mongoose.model("Institution", schema);
