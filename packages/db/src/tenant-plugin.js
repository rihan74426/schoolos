import { Schema } from 'mongoose';

const OPS = ['find', 'findOne', 'findOneAndUpdate', 'updateOne', 'updateMany', 'deleteOne', 'deleteMany', 'countDocuments'];

export function tenantPlugin(schema) {
  schema.add({
    institutionId: { type: Schema.Types.ObjectId, ref: 'Institution', required: true, index: true },
  });

  for (const op of OPS) {
    schema.pre(op, function requireTenantScope() {
      if (!this.getFilter().institutionId) throw new Error(`Tenant scope required: ${op}`);
    });
  }

  schema.pre('aggregate', function requireAggregateTenantScope() {
    if (!this.pipeline()[0]?.$match?.institutionId) {
      throw new Error('Tenant scope required: aggregate');
    }
  });
}
