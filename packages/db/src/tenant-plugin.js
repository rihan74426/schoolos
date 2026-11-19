import { Schema } from 'mongoose';

const OPS = ['find', 'findOne', 'findOneAndUpdate', 'updateOne', 'updateMany', 'deleteOne', 'deleteMany', 'countDocuments', 'findOneAndDelete', 'findOneAndReplace', 'replaceOne', 'distinct'];

export function tenantPlugin(schema, { allowClerkUserLookup = false, allowTokenHashLookup = false } = {}) {
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
      // Invite acceptance happens before the tenant is known: a 64-hex SHA-256 token hash IS the credential.
      const trustedTokenLookup = allowTokenHashLookup
        && ['find', 'findOne', 'findOneAndUpdate'].includes(op)
        && typeof filter.tokenHash === 'string'
        && /^[a-f0-9]{64}$/.test(filter.tokenHash);
      if (!filter.institutionId && !trustedMembershipLookup && !trustedTokenLookup) {
        throw new Error(`Tenant scope required: ${op}`);
      }
      // Scope must be a single tenant (ObjectId or string). Operator objects such as
      // $ne, $in or $exists could span tenants, so they are rejected.
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
