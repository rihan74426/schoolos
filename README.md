# SchoolOS

A pnpm/Turborepo monorepo for a mobile-friendly school operations platform serving Islamic institutions, madrasas, and modern schools.

## Workspace

- `apps/web` — Next.js App Router admin portal and API route handlers
- `apps/mobile` — Expo app scaffold
- `packages/core` — pure domain rules, Zod schemas, and Vitest tests
- `packages/db` — MongoDB/Mongoose models and tenant-aware utilities (server-only)
- `packages/i18n` — English, Bangla, and Arabic strings
- `docs/specs` — plain-language domain rules
- `docs/architecture/mvp-foundation.md` — release scope, trust boundaries, and local setup

## Build the basics first

The first release focuses on institution setup, admissions, student/guardian records, attendance, timetable, notices, fees, exams/results, and syllabus/book lists. AI remains a supervised, draft-first follow-on. Institutions configure their own curriculum, language, dates, and policies; qualified people approve official learning content and decisions.

## Requirements and local development

- Node.js 18.18 or newer
- pnpm 9.12.0
- MongoDB 8 or MongoDB Atlas; transactions require a replica set (Atlas or local `mongod --replSet rs0`)

```bash
corepack enable
corepack prepare pnpm@9.12.0 --activate
pnpm install
cp .env.example .env
pnpm dev:web
```

Set `MONGODB_URI` in `.env`. Open `http://localhost:3000/admin/dashboard`. Run `pnpm test`, `pnpm lint`, `pnpm typecheck`, and `pnpm build` before submitting changes.

Tenant isolation is enforced in the Mongoose service layer and tenant plugin. Every query for tenant-owned data must include the verified `institutionId` from an authenticated membership. Never trust a tenant ID supplied by the browser. The Clerk integration gates admin routes and supports a signed user-deletion webhook; creating institution memberships remains an explicit, administrator-controlled invitation process.

The repository is a development foundation, not a production-ready school system. Do not use real student or guardian data until authentication setup, tenant authorization, audit, privacy, retention/export/deletion, and security workflows have been reviewed and tested.
