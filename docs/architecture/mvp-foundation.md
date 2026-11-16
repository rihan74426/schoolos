# SchoolOS MVP foundation

## Product boundary

Start with a Bangladesh-first, mobile-friendly operating system for one pilot segment. Deliver reliable school workflows before AI features. Institutions configure their own curriculum, language, dates, and policies; religious content and official academic decisions remain under qualified human review.

## First release sequence

1. Institution and campus setup, academic years, grade levels, sections, identity memberships, and permissions.
2. Admission and student/guardian/staff records, with import/export planned before production data migration.
3. Attendance, timetable/calendar, notices, and delivery status.
4. Basic fee records, exams, marks, approval, and reports.
5. Book lists, syllabus versions, and a teacher workspace.

AI drafting, OCR, automated scheduling, biometrics, predictive analytics, and high-stakes automated decisions are explicitly out of the first release.

## Initial web routes

- `/admin/dashboard` — setup progress and operational exceptions
- `/admin/setup` — institution and academic-year setup
- `/admin/admissions` — admission review queue (next vertical slice)
- `/admin/students` and `/admin/students/[studentId]` — student directory and profile
- `/admin/academics/attendance` — daily class register
- `/admin/academics/schedule` — calendar and timetable
- `/admin/academics/grading` and `/admin/exams` — assessment and results
- `/admin/finance/fees` — fee plans and ledger
- `/admin/communications` — notices and delivery history

Pages are not production-ready until authentication, tenant context, server-side authorization, persistence, audit events, and tests are connected. Do not enter real student or guardian data into the present UI scaffold.

## Data and trust boundaries

PostgreSQL is the operational source of truth. Prisma schema begins with institutions, campuses, memberships, academic structure, students, guardians, attendance, and audit events. Every server data operation must derive institution scope from the authenticated membership. A tenant ID supplied by the browser is never authorization. Add role and record-scope checks to every read and write before exposing data APIs.

Personal data about children requires data minimization, verified guardian relationships, access logging, retention/export/deletion processes, secure file handling, and local legal review before a pilot. Keep demo data synthetic.

## Local database

Copy `packages/db/.env.example` to the root `.env` (or configure `DATABASE_URL` in the environment), start a local PostgreSQL database, then run:

```bash
pnpm install
pnpm --filter @schoolos/db db:validate
pnpm --filter @schoolos/db db:generate
pnpm --filter @schoolos/db db:migrate
```

This repository change defines the schema and scripts; dependency installation and database migration still need to be run in a local environment with PostgreSQL available.
