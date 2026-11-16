import mongoose from 'mongoose';

export const tenantPlugin = (schema) => {
  schema.add({
    tenantId: { type: String, required: true, index: true },
  });

  schema.index({ tenantId: 1, createdAt: -1 });
};

export const connectDb = async (uri) => mongoose.connect(uri);
