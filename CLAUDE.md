# SchoolOS — guidance for AI assistants

Bangladesh-first, multi-tenant school/madrasa management SaaS. Goal: a pilot-ready MVP (one school can onboard, enroll students, take attendance, notify guardians) with **zero cross-school data leaks**. AI, hostel, ranking, and mobile are out of first-release scope.

The user (NJ) is a Next.js/JavaScript developer who wants **short answers, low token use, and fixes that fit the current setup**. Always review your own output for errors. Any generic "Homy household SaaS" brief in older notes is stale — ignore it.

## Stack and layout

pnpm 9 + Turborepo monorepo. Next.js 14 App Router, React 18.3, Clerk v6 (`@clerk/nextjs`), MongoDB via Mongoose 8, zod, plain CSS (no Tailwind/shadcn). Core and db are plain JS (ESM); web is TypeScript.

- `apps/web` — Next.js app. `server/` = server-only services (`import "server-only"`); `app/**/actions.ts` = thin server actions; `tests/` = service tests (vitest + mongodb-memory-server).
- `packages/core` — DB-free domain rules, zod schemas, permission matrix. Vitest.
- `packages/db` — Mongoose models, `tenantPlugin`, `connectDb`, `withOptionalTransaction`. Isolation tests.
- `packages/i18n` — en/bn/ar message tables (shell only so far).
- `apps/mobile` — Expo scaffold, **frozen** (PWA first). Not in `dev` or root `typecheck`; do not extend.

Commands: `pnpm install`; `pnpm --filter @schoolos/core test|typecheck`; `pnpm --filter @schoolos/db test`; `pnpm --filter @schoolos/web test|typecheck|lint`. CI (`.github/workflows/ci.yml`) runs all of them. DB tests download a MongoDB binary and fail in network-restricted sandboxes; that is an environment limit, not a code bug.

## Architecture rules

- **Service pattern**: server action (auth + permission) → `server/*.ts` service (validate, query, audit) → models. No business logic in React components or actions.
- **Return, don't throw, for expected failures.** Actions return `{ ok:false, error }`. Never `throw new Response(...)` in server actions (becomes a generic 500). Use `AuthError` + `authFailure()` from `server/auth.ts`; use `redirect()` in pages and form actions.
- **Permissions**: add actions to `permissionMatrix` in `packages/core/src/permissions`, then call `requirePermission("<action>")`. Never inline role lists. Teachers need an active `TeachingAssignment` for a section unless the role has `attendance:any-section`.
- **Configurable by institution**: grading schemes (`GradingScheme`, presets in `grading-schemes.js` or custom bands) and policy (`InstitutionPolicy`: attendance, fees, hostel, ranking, calendar) are DATA collected from the founder at onboarding. Do not hardcode thresholds, grade bands, late-fee rules, or room capacities in code; read them from policy. Presets are templates the founder must confirm. Policy edits use optimistic `version` + an `AuditEvent` with before/after.
- **Atomic writes with audit**: use `withOptionalTransaction` so a change and its audit event commit together (falls back to no session on standalone Mongo).

## Tenancy and auth (critical)

- Every tenant-owned model uses `tenantPlugin`; **every** read/update/delete filter must include a single `institutionId` (ObjectId or string). Operator objects (`$in`, `$ne`, …) as the scope are rejected. `Institution` is the tenant root. `Membership` allows only the narrow Clerk-user lookup (`clerkUserId` + `active:true`).
- Always `findOne({ _id, institutionId })`; never `findById` on tenant data. Mongo has no foreign keys: verify related ids (section, student, subject) belong to the same institution in the service.
- Never trust a client-supplied institution. Resolve memberships from the Clerk identity and validate the HttpOnly `active-school` cookie against them (`resolveActiveMembership`).
- Validate ids with `mongoose.isObjectIdOrHexString`, never `isValidObjectId`.
- **Invites**: single-use, 7-day links at `/join/<token>`. Only the SHA-256 hash is stored (never log or audit the raw token). `Invitation` allows lookup by `tokenHash` alone (plugin option `allowTokenHashLookup`); acceptance claims atomically, never changes an existing member's role, and `invitableRoles(role)` limits who can invite whom. Invited staff must complete a `Staff` profile (`/admin/welcome`) before the dashboard.
- Webhook: `/api/webhooks/clerk` uses `verifyWebhook`; env `CLERK_WEBHOOK_SIGNING_SECRET`. Middleware is `middleware.ts` (Next 14); `auth()` is async in Clerk v6.

## Data rules

- Money = integer minor units (paisa). Dates = `YYYY-MM-DD` strings for school days (Asia/Dhaka) or UTC `Date`s for instants. Validate all input with zod; never trust the client.
- **Attendance** is immutable after first submit unless a correction reason (≥10 chars) is given; corrections store a before/after diff in `AuditEvent`. First-submit races resolve via the unique index + status filter.
- **Student vs Enrollment**: `Enrollment` is the source of truth; `Student.sectionId` is a denormalized current-section cache. Update both in one transaction (not yet implemented for enrollment flows).
- Audit sensitive changes (attendance, policy, grading, roles, fees) with `AuditEvent`.

## Roadmap (check `docs/` and project memory for detail)

Done: monorepo/CI, Clerk auth + webhook, tenancy, onboarding bootstrap with preset rules, attendance service (full-roster + teacher correction window from policy), grading/policy engine + services, permission matrix, structure services (academic year/class/section), teaching-assignment admin, Settings page (structure, assignments, rules, custom grading schemes), setup checklist, staff invite links (WhatsApp/Messenger share) + welcome/profile flow.
Next: students + guardians (CSV import, enrollment txn) → attendance roster UI + notices/SMS (provider TBD) → fees → exams/marks approval → guardian view. Ranking is deferred (not exported from core). PDPA legal review is required before real child data.

## Conventions

- Mobile-first, plain CSS with logical properties (`margin-inline-start`, `text-align:start`) so Arabic RTL works. Fonts via `next/font` (options must be literals, no spreads).
- Keep secrets in local env files; never commit `.env.local` or `*.tsbuildinfo`.
- Prefer editing existing files; small, tested changes; run typecheck + lint + tests before saying "done", and say plainly what could not be run.
