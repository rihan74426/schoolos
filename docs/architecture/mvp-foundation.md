# SchoolOS MVP foundation

## Product boundary

Start with a Bangladesh-first, mobile-friendly operating system for one pilot segment. Deliver reliable school workflows before AI features. Institutions configure their own curriculum, language, dates, and policies; qualified people approve religious content and official academic decisions.

## First release sequence

1. Institution and campus setup, academic years, grade levels, sections, identity memberships, and permissions.
2. Admission and student/guardian/staff records, with import/export planned before production data migration.
3. Attendance, timetable/calendar, notices, and delivery status.
4. Basic fee records, exams, marks, approval, and reports.
5. Book lists, syllabus versions, and a teacher workspace.

AI drafting, OCR, automated scheduling, biometrics, predictive analytics, and high-stakes automated decisions are explicitly out of the first release.

## Architecture and data boundaries

The application uses a modular monolith with MongoDB/Mongoose as its operational store. Mongoose models are under `packages/db/src/models`; business workflows belong in server services, not page components. Tenant-owned collections carry `institutionId`; the Mongoose plugin rejects unscoped queries for these models. Services derive institution scope from the authenticated membership and verify that referenced students, sections, and related records belong to the same institution before writes.

MongoDB does not provide relational foreign keys. Add explicit service-layer ownership checks, compound unique indexes, idempotency where external side effects are retried, and tests across two institutions. Multi-document transactions (for example, admission conversion and payments) require a replica set. Keep demo data synthetic.

## Local database

Copy `.env.example` to `.env`, configure `MONGODB_URI`, and start MongoDB. For transaction-enabled local development, run MongoDB as a replica set (`mongod --replSet rs0`) and initialize it once. Then:

```bash
pnpm install
pnpm dev:web
pnpm --filter @schoolos/db test
```

The tenant-isolation test uses `mongodb-memory-server`. The repository defines the model and application foundations; it does not provision MongoDB or install dependencies in the GitHub-hosted environment.

## Security and privacy gate

Child and guardian data requires verified identity and institution scope, minimal collection, least privilege, auditability, secure retention/export/deletion, and local legal review before a pilot. Clerk authentication proves identity; application membership and role checks authorize each operation. Membership creation is explicitly controlled and is not inferred from untrusted user profile metadata.
