# SchoolOS

A monorepo for school operations management.

## Structure

- `apps/web` — Next.js App Router web app and API routes
- `apps/mobile` — Expo React Native app
- `packages/core` — pure JS rules, Zod schemas, and Vitest tests
- `packages/db` — Mongoose data models and tenant-aware utilities
- `packages/i18n` — English, Bangla, and Arabic strings
- `docs/specs` — plain-language rule specifications per domain

## Getting started

```bash
pnpm install
pnpm dev
```

## Scripts

```bash
pnpm build
pnpm lint
pnpm test
```
