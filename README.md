# SchoolOS

A pnpm/Turborepo monorepo for a mobile-friendly school operations platform serving Islamic institutions, madrasas, and modern schools.

## Workspace

- `apps/web` — Next.js App Router admin portal and API route handlers
- `apps/mobile` — Expo app scaffold
- `packages/core` — pure domain rules, Zod schemas, and Vitest tests
- `packages/db` — PostgreSQL/Prisma operational data model (server-only)
- `packages/i18n` — English, Bangla, and Arabic strings
- `docs/specs` — plain-language domain rules
- `docs/architecture/mvp-foundation.md` — release scope, trust boundaries, and local database setup

## Build the basics first

The first release focuses on institution setup, admissions, student/guardian records, attendance, timetable, notices, fees, exams/results, and basic syllabus/book lists. AI remains a supervised, draft-first follow-on after the data, permission, and approval foundations are reliable. See the MVP foundation document for the scope and release gates.

## Requirements and local development

- Node.js 18.18 or newer
- pnpm 9.12.0
- PostgreSQL for database-backed development

```bash
corepack enable
corepack prepare pnpm@9.12.0 --activate
pnpm install
cp packages/db/.env.example .env
pnpm --filter @schoolos/db db:generate
pnpm --filter @schoolos/db db:migrate
pnpm dev:web
```

Open `http://localhost:3000/admin/dashboard`. `pnpm dev` runs all workspace development tasks. Run `pnpm test`, `pnpm lint`, `pnpm typecheck`, and `pnpm build` before submitting changes.

The repository currently contains UI and domain foundations, not a production-ready school system. Do not use real student/guardian data until authentication, verified tenant membership, server-side access control, and privacy/security workflows are implemented and reviewed.
