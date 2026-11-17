import { Schema } from 'mongoose';

const OPS = ['find', 'findOne', 'findOneAndUpdate', 'updateOne', 'updateMany', 'deleteOne', 'deleteMany', 'countDocuments', 'findOneAndDelete', 'findOneAndReplace', 'replaceOne', 'distinct'];

export function tenantPlugin(schema, { allowClerkUserLookup = false } = {}) {
  schema.add({
    institutionId: { type: Schema.Types.ObjectId, ref: 'Institution', required: true, index: true },
  });

  for (const op of OPS) {
    schema.pre(op, function requireTenantScope() {
      const filter = this.getFilter();
      const trustedMembershipLookup = allowClerkUserLookup
        && ['find', 'findOne'].includes(op)
        && typeof filter.clerkUserId === 'string'
        && filter.active === true;
      if (!filter.institutionId && !trustedMembershipLookup) {
        throw new Error(`Tenant scope required: ${op}`);
      }
      const id = filter.institutionId;
      if (id && typeof id === 'object' && id.constructor === Object) {
        throw new Error(`Invalid tenant scope: ${op}`);
      }
    });
  }

  schema.pre('aggregate', function requireAggregateTenantScope() {
    if (!this.pipeline()[0]?.$match?.institutionId) {
      throw new Error('Tenant scope required: aggregate');
    }
  });
}
