# SchoolOS

A pnpm/Turborepo monorepo for school operations management.

## Workspace

- `apps/web` — Next.js App Router, admin portal, and API route handlers
- `apps/mobile` — Expo React Native app
- `packages/core` — pure JavaScript domain rules, Zod schemas, and Vitest tests
- `packages/db` — MongoDB/Mongoose models and tenant-aware utilities (server only)
- `packages/i18n` — English, Bangla, and Arabic strings
- `docs/specs` — plain-language rule specifications by domain

## Requirements

- Node.js 18.18 or newer
- pnpm 9.12.0
- MongoDB for database-backed development

## Local development

```bash
corepack enable
corepack prepare pnpm@9.12.0 --activate
pnpm install
cp .env.example .env
pnpm dev:web
```

Configure `MONGODB_URI` in `.env`. Use a MongoDB replica set (Atlas or local `mongod --replSet rs0`) for multi-document transactions. The admin portal is at `http://localhost:3000/admin/dashboard`.

Useful checks:

```bash
pnpm test
pnpm lint
pnpm typecheck
pnpm build
```

The admin portal has basic navigation and starter views. Real student/guardian data must not be added until authentication, tenant authorization, database persistence, and privacy/security workflows are connected and reviewed.
