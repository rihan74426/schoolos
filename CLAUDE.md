# SchoolOS repository guidance

- This is a pnpm 9 monorepo. Use `pnpm install` after dependency changes.
- Run package checks directly when diagnosing failures: `pnpm --filter @schoolos/core typecheck`, `pnpm --filter @schoolos/core test`, `pnpm --filter @schoolos/db test`, `pnpm --filter @schoolos/web typecheck`, and `pnpm --filter @schoolos/web lint`.
- Tenant-owned Mongo models must use `tenantPlugin`; every read/update/delete query must include `institutionId`. `Institution` is the tenant root. Membership lookups by Clerk user ID are a narrow auth-only exception configured on the Membership model.
- Never trust a client-supplied institution as authorization. Resolve active memberships from Clerk identity and validate the HttpOnly `active-school` cookie against those memberships.
- Attendance submissions are immutable after initial submission unless a correction reason is supplied. Corrections must retain a before/after audit diff.
- Keep secrets in local environment files; never commit populated `.env.local` files or credentials.
- The web app uses Next.js App Router, Clerk, Mongoose, and server actions. Keep tenant-sensitive database operations in server-only code.
